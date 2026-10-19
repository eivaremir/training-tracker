//! Amazon Bedrock: model discovery and performance reviews via the model-agnostic Converse API.
//!
//! Listed models are text-in/text-out, active, invocable on demand (directly or through a
//! system inference profile) and already authorized for this account. Anthropic models are
//! excluded on purpose: Claude is used through Anthropic's own API with the user's key instead.
//!
//! Models differ in what Converse accepts (Grok rejects `temperature`, Mistral 7B rejects system
//! prompts, Llama 3 caps output at 2048 tokens). `review` drops whatever a model's
//! ValidationException names, retries, and remembers the result per model.
use crate::error::ApiError;
use anyhow::{Context, Result};
use aws_sdk_bedrock::types::{
    AuthorizationStatus, EntitlementAvailability, FoundationModelLifecycleStatus, InferenceProfileType, InferenceType,
    ModelModality, RegionAvailability,
};
use aws_sdk_bedrockruntime::config::http::HttpResponse;
use aws_sdk_bedrockruntime::config::timeout::TimeoutConfig;
use aws_sdk_bedrockruntime::error::{DisplayErrorContext, SdkError};
use aws_sdk_bedrockruntime::operation::converse::{ConverseError, ConverseOutput};
use aws_sdk_bedrockruntime::types::{
    ContentBlock, ConversationRole, InferenceConfiguration, Message, StopReason, SystemContentBlock,
};
use serde::Serialize;
use std::collections::{HashMap, HashSet};
use std::sync::Mutex;
use std::time::{Duration, Instant};

const CACHE_TTL: Duration = Duration::from_secs(3600);
pub const MAX_PROMPT_CHARS: usize = 24_000;
pub const DAILY_LIMIT: u32 = 30;
/// Output budget. Reasoning models (Grok, GPT-OSS, DeepSeek R1…) spend most of it thinking before
/// they answer: Grok 4.7 uses ~1.4k tokens on a typical day's review.
const MAX_TOKENS: i32 = 4096;
const TEMPERATURE: f32 = 0.4;
/// Reasoning models take 10-40 s per review. Stop waiting before the Lambda's own 90 s timeout
/// so the client gets a readable error instead of a bare 5xx.
const CONVERSE_TIMEOUT: Duration = Duration::from_secs(80);

type ConverseFailure = SdkError<ConverseError, HttpResponse>;

const SYSTEM_PROMPT: &str = "You are an experienced strength and conditioning coach reviewing a user's training log. \
Base every observation only on the data provided. Be specific and concise: what went well, what to watch, \
and 1-3 concrete suggestions for the next session (load, reps, rest, exercise choice), measured against its listed goals when given. \
When you discuss volume progress or goal achievement, state the change as a percentage up or down, using the figures precomputed in the log; do not compute new ones. \
Use the weight unit the log uses (kg or lb); a weight of 0 means bodyweight. \
Format the answer in concise Markdown: short '###' sections (for example What went well, Watch, Next session), bullet lists, **bold** for key numbers; no tables. \
Do not give medical advice; if something suggests pain or injury, recommend consulting a professional. \
Reply in English unless the user's question is clearly written in another language, then use that language.";

#[derive(Debug, Clone, Serialize)]
pub struct ModelInfo {
    /// Id to pass to Converse (model id or inference profile id).
    pub id: String,
    pub name: String,
    pub provider: String,
}

/// What a model accepts in a Converse request, narrowed by its ValidationExceptions.
#[derive(Debug, Clone, Copy)]
struct Shape { temperature: bool, system: bool, max_tokens: i32 }

impl Default for Shape {
    fn default() -> Self { Self { temperature: true, system: true, max_tokens: MAX_TOKENS } }
}

impl Shape {
    /// Drops what a ValidationException complains about; false if it names nothing we can drop.
    fn relax(&mut self, msg: &str) -> bool {
        let m = msg.to_lowercase();
        if self.temperature && m.contains("temperature") {
            self.temperature = false;
        } else if self.system && m.contains("system message") {
            self.system = false;
        } else if let Some(limit) = token_limit(&m).filter(|&n| n > 0 && n < self.max_tokens) {
            self.max_tokens = limit;
        } else {
            return false;
        }
        true
    }
}

/// "The maximum tokens you requested exceeds the model limit of 2048. …" → 2048
fn token_limit(msg: &str) -> Option<i32> {
    if !msg.contains("maximum tokens") { return None; }
    msg.split("limit of ").nth(1)?.split(|c: char| !c.is_ascii_digit()).next()?.parse().ok()
}

pub struct Ai {
    control: aws_sdk_bedrock::Client,
    runtime: aws_sdk_bedrockruntime::Client,
    cache: Mutex<Option<(Instant, Vec<ModelInfo>)>>,
    shapes: Mutex<HashMap<String, Shape>>,
    /// Models Bedrock refused (access denied / not found); hidden until the next discovery.
    broken: Mutex<HashSet<String>>,
}

impl Ai {
    pub fn new(conf: &aws_config::SdkConfig) -> Self {
        let timeouts = TimeoutConfig::builder()
            .connect_timeout(Duration::from_secs(3))
            .operation_timeout(CONVERSE_TIMEOUT)
            .build();
        let runtime = aws_sdk_bedrockruntime::config::Builder::from(conf).timeout_config(timeouts).build();
        Self {
            control: aws_sdk_bedrock::Client::new(conf),
            runtime: aws_sdk_bedrockruntime::Client::from_conf(runtime),
            cache: Mutex::new(None),
            shapes: Mutex::new(HashMap::new()),
            broken: Mutex::new(HashSet::new()),
        }
    }

    pub async fn models(&self) -> Result<Vec<ModelInfo>> {
        let cached = self.cache.lock().unwrap().as_ref()
            .and_then(|(at, list)| (at.elapsed() < CACHE_TTL).then(|| list.clone()));
        let list = match cached {
            Some(list) => list,
            None => {
                let list = self.discover().await?;
                *self.cache.lock().unwrap() = Some((Instant::now(), list.clone()));
                self.broken.lock().unwrap().clear();
                list
            }
        };
        let broken = self.broken.lock().unwrap();
        Ok(list.into_iter().filter(|m| !broken.contains(&m.id)).collect())
    }

    async fn discover(&self) -> Result<Vec<ModelInfo>> {
        let summaries = self.control.list_foundation_models()
            .by_output_modality(ModelModality::Text)
            .send().await.context("list_foundation_models")?
            .model_summaries.unwrap_or_default();

        // Models only reachable through a cross-region system inference profile (e.g. "us.meta.llama…").
        let profiles: Vec<_> = self.control.list_inference_profiles()
            .type_equals(InferenceProfileType::SystemDefined)
            .into_paginator().items().send().try_collect().await.context("list_inference_profiles")?;
        let mut profile_for: HashMap<String, String> = HashMap::new();
        for p in &profiles {
            for m in p.models() {
                if let Some(arn) = m.model_arn() {
                    profile_for.entry(arn.to_owned()).or_insert_with(|| p.inference_profile_id().to_owned());
                }
            }
        }

        let mut candidates = Vec::new();
        for m in summaries {
            let provider = m.provider_name().unwrap_or_default().to_owned();
            let id = m.model_id().to_owned();
            let lower = id.to_lowercase();
            let active = m.model_lifecycle().is_some_and(|l| *l.status() == FoundationModelLifecycleStatus::Active);
            let text_in = m.input_modalities().contains(&ModelModality::Text);
            // Not chat models: embeddings, rerankers, safety classifiers, speech-to-speech (Nova Sonic)
            // and video understanding (TwelveLabs Pegasus); Converse can't run them on a text prompt.
            let special = ["embed", "rerank", "guard", "safeguard", "sonic", "pegasus"].iter().any(|w| lower.contains(w));
            if provider.eq_ignore_ascii_case("anthropic") || !active || !text_in || special { continue; }
            let invoke_id = if m.inference_types_supported().contains(&InferenceType::OnDemand) {
                id.clone()
            } else if let Some(p) = profile_for.get(m.model_arn()) {
                p.clone()
            } else {
                continue;
            };
            candidates.push((id, ModelInfo { id: invoke_id, name: m.model_name().unwrap_or(&m.model_id).to_owned(), provider }));
        }

        // Keep only models this account can call right now (no pending use-case/agreement approval).
        let mut checks = tokio::task::JoinSet::new();
        for (model_id, info) in candidates {
            let control = self.control.clone();
            checks.spawn(async move {
                let a = control.get_foundation_model_availability().model_id(&model_id).send().await.ok()?;
                let ok = a.authorization_status() == &AuthorizationStatus::Authorized
                    && a.entitlement_availability() == &EntitlementAvailability::Available
                    && a.region_availability() == &RegionAvailability::Available;
                ok.then_some(info)
            });
        }
        let mut models = Vec::new();
        while let Some(r) = checks.join_next().await {
            if let Ok(Some(m)) = r { models.push(m); }
        }
        models.sort_by(|a, b| a.provider.cmp(&b.provider).then(a.name.cmp(&b.name)));
        models.dedup_by(|a, b| a.id == b.id);
        Ok(models)
    }

    pub async fn review(&self, model_id: &str, prompt: &str) -> Result<String, ApiError> {
        let mut shape = self.shapes.lock().unwrap().get(model_id).copied().unwrap_or_default();
        // One retry per thing a model can reject (temperature, system prompt, output budget).
        let out = loop {
            match self.converse(model_id, prompt, shape).await {
                Ok(out) => break out,
                Err(e) => {
                    let msg = match e.as_service_error() {
                        Some(ConverseError::ValidationException(v)) => v.message().unwrap_or_default(),
                        _ => "",
                    };
                    if !shape.relax(msg) { return Err(self.converse_error(model_id, e)); }
                    tracing::info!(model = model_id, ?shape, reason = msg, "retrying bedrock converse");
                    self.shapes.lock().unwrap().insert(model_id.to_owned(), shape);
                }
            }
        };
        let text = out.output().and_then(|o| o.as_message().ok())
            .map(|m| m.content().iter().filter_map(|c| c.as_text().ok()).cloned().collect::<Vec<_>>().join("\n"))
            .unwrap_or_default();
        if text.trim().is_empty() {
            tracing::warn!(model = model_id, stop_reason = ?out.stop_reason(), usage = ?out.usage(), "bedrock returned no text");
            return Err(ApiError::BadGateway(match out.stop_reason() {
                StopReason::MaxTokens => "The model used up its output budget before answering. Try again or pick another model.",
                _ => "The model returned an empty answer. Try again or pick another model.",
            }.into()));
        }
        Ok(text)
    }

    async fn converse(&self, model_id: &str, prompt: &str, shape: Shape) -> Result<ConverseOutput, ConverseFailure> {
        let text = if shape.system { prompt.to_owned() } else { format!("{SYSTEM_PROMPT}\n\n{prompt}") };
        let message = Message::builder().role(ConversationRole::User).content(ContentBlock::Text(text)).build()
            .expect("role and content are set");
        let mut config = InferenceConfiguration::builder().max_tokens(shape.max_tokens);
        if shape.temperature { config = config.temperature(TEMPERATURE); }
        let mut req = self.runtime.converse().model_id(model_id).messages(message).inference_config(config.build());
        if shape.system { req = req.system(SystemContentBlock::Text(SYSTEM_PROMPT.into())); }
        req.send().await
    }

    /// Logs a failed Converse call and turns it into a message the user can act on.
    fn converse_error(&self, model_id: &str, e: ConverseFailure) -> ApiError {
        tracing::error!(model = model_id, error = %DisplayErrorContext(&e), "bedrock converse failed");
        let Some(service) = e.as_service_error() else {
            return match e {
                SdkError::TimeoutError(_) => ApiError::GatewayTimeout(
                    "The model took too long to answer. Try again or pick a faster model.".into()),
                e => ApiError::Internal(anyhow::Error::new(e).context(format!("bedrock converse ({model_id})"))),
            };
        };
        match service {
            ConverseError::ThrottlingException(_) =>
                ApiError::TooManyRequests("Amazon Bedrock is throttling this model. Wait a minute and try again.".into()),
            ConverseError::ModelTimeoutException(_) =>
                ApiError::GatewayTimeout("The model took too long to answer. Try again or pick a faster model.".into()),
            ConverseError::ModelNotReadyException(_) | ConverseError::ServiceUnavailableException(_)
            | ConverseError::InternalServerException(_) =>
                ApiError::Unavailable("Amazon Bedrock can't run this model right now. Try again in a moment.".into()),
            ConverseError::AccessDeniedException(_) | ConverseError::ResourceNotFoundException(_) => {
                self.broken.lock().unwrap().insert(model_id.to_owned());
                ApiError::BadGateway("Amazon Bedrock refused this model for this server. Pick another model.".into())
            }
            ConverseError::ValidationException(v) =>
                ApiError::BadGateway(format!("The model rejected the request: {}", v.message().unwrap_or("invalid request"))),
            ConverseError::ModelErrorException(v) =>
                ApiError::BadGateway(format!("The model failed: {}", v.message().unwrap_or("unknown error"))),
            _ => ApiError::BadGateway("Amazon Bedrock returned an error. Try again or pick another model.".into()),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn relaxes_what_bedrock_rejects() {
        let mut s = Shape::default();
        assert!(s.relax("This model doesn't support the temperature field. Remove temperature and try again."));
        assert!(!s.temperature);
        assert!(s.relax("This model doesn't support system messages. Try again without a system message or use a model that supports system messages."));
        assert!(!s.system);
        assert!(s.relax("The maximum tokens you requested exceeds the model limit of 2048. Try again with a maximum tokens value that is lower than 2048."));
        assert_eq!(s.max_tokens, 2048);
        // Nothing left to drop, so these surface as errors instead of looping.
        assert!(!s.relax("This model doesn't support the temperature field. Remove temperature and try again."));
        assert!(!s.relax("The maximum tokens you requested exceeds the model limit of 2048."));
        assert!(!s.relax("Input is too long for requested model."));
    }
}
