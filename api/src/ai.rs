//! Amazon Bedrock: model discovery and performance reviews via the model-agnostic Converse API.
//!
//! Listed models are text-in/text-out, active, invocable on demand (directly or through a
//! system inference profile) and already authorized for this account. Anthropic models are
//! excluded on purpose: Claude is used through Anthropic's own API with the user's key instead.
use anyhow::{Context, Result};
use aws_sdk_bedrock::types::{
    AuthorizationStatus, EntitlementAvailability, FoundationModelLifecycleStatus, InferenceProfileType, InferenceType,
    ModelModality, RegionAvailability,
};
use aws_sdk_bedrockruntime::types::{ContentBlock, ConversationRole, InferenceConfiguration, Message, SystemContentBlock};
use serde::Serialize;
use std::collections::HashMap;
use std::sync::Mutex;
use std::time::{Duration, Instant};

const CACHE_TTL: Duration = Duration::from_secs(3600);
pub const MAX_PROMPT_CHARS: usize = 24_000;
pub const DAILY_LIMIT: u32 = 30;

const SYSTEM_PROMPT: &str = "You are an experienced strength and conditioning coach reviewing a user's training log. \
Base every observation only on the data provided. Be specific and concise: what went well, what to watch, \
and 1-3 concrete suggestions for the next session (load, reps, rest, exercise choice). Use the weight unit the log uses (kg or lb); a weight of 0 means bodyweight. \
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

pub struct Ai {
    control: aws_sdk_bedrock::Client,
    runtime: aws_sdk_bedrockruntime::Client,
    cache: Mutex<Option<(Instant, Vec<ModelInfo>)>>,
}

impl Ai {
    pub fn new(conf: &aws_config::SdkConfig) -> Self {
        Self {
            control: aws_sdk_bedrock::Client::new(conf),
            runtime: aws_sdk_bedrockruntime::Client::new(conf),
            cache: Mutex::new(None),
        }
    }

    pub async fn models(&self) -> Result<Vec<ModelInfo>> {
        if let Some((at, list)) = self.cache.lock().unwrap().as_ref() {
            if at.elapsed() < CACHE_TTL { return Ok(list.clone()); }
        }
        let list = self.discover().await?;
        *self.cache.lock().unwrap() = Some((Instant::now(), list.clone()));
        Ok(list)
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
            let special = ["embed", "rerank", "guard", "safeguard"].iter().any(|w| lower.contains(w));
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

    pub async fn review(&self, model_id: &str, prompt: &str) -> Result<String> {
        let out = self.runtime.converse()
            .model_id(model_id)
            .system(SystemContentBlock::Text(SYSTEM_PROMPT.into()))
            .messages(Message::builder().role(ConversationRole::User).content(ContentBlock::Text(prompt.into())).build()?)
            .inference_config(InferenceConfiguration::builder().max_tokens(1200).temperature(0.4).build())
            .send().await.context("bedrock converse")?;
        let text = out.output().and_then(|o| o.as_message().ok())
            .map(|m| m.content().iter().filter_map(|c| c.as_text().ok()).cloned().collect::<Vec<_>>().join("\n"))
            .unwrap_or_default();
        anyhow::ensure!(!text.trim().is_empty(), "model returned no text");
        Ok(text)
    }
}
