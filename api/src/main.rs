//! Training Tracker API — runs on AWS Lambda (behind an API Gateway HTTP API) or,
//! when not inside Lambda, as a plain HTTP server (local Docker development).
mod ai;
mod auth;
mod db;
mod error;
mod model;
mod push;
mod reminders;

use auth::{Keys, UserId};
use axum::{
    extract::{Path, State},
    http::{HeaderValue, Method, StatusCode},
    routing::{get, post, put},
    Json, Router,
};
use db::{Kind, Repo};
use error::{ApiError, ApiResult};
use model::{AppState, DayLog, Exercise, Plan, Routine, Session, Settings, Validate, WeightEntry};
use serde::de::DeserializeOwned;
use serde_json::{json, Value};
use std::sync::Arc;
use tower_http::cors::{AllowOrigin, CorsLayer};

pub struct AppCtx {
    repo: Repo,
    keys: Keys,
    /// Argon2 hash of a random string, verified against for unknown emails (constant-ish login timing).
    dummy_hash: String,
    ai: ai::Ai,
    /// None when no VAPID key is configured (push endpoints then return 503).
    vapid: Option<push::Vapid>,
    http: reqwest::Client,
}

type Ctx = State<Arc<AppCtx>>;

async fn health() -> Json<Value> { Json(json!({ "ok": true })) }

async fn get_state(State(ctx): Ctx, UserId(user): UserId) -> ApiResult<Json<AppState>> {
    Ok(Json(ctx.repo.load_state(&user).await?))
}

async fn seed(State(ctx): Ctx, UserId(user): UserId, Json(s): Json<AppState>) -> ApiResult<StatusCode> {
    s.exercises.iter().try_for_each(Validate::validate).map_err(ApiError::BadRequest)?;
    s.routines.iter().try_for_each(Validate::validate).map_err(ApiError::BadRequest)?;
    s.plans.iter().try_for_each(Validate::validate).map_err(ApiError::BadRequest)?;
    s.sessions.iter().try_for_each(Validate::validate).map_err(ApiError::BadRequest)?;
    s.days.iter().try_for_each(Validate::validate).map_err(ApiError::BadRequest)?;
    s.weights.iter().try_for_each(Validate::validate).map_err(ApiError::BadRequest)?;
    ctx.repo.seed(&user, &s).await?;
    Ok(StatusCode::NO_CONTENT)
}

/// PUT /{collection}/{id} — full upsert of one entity; the path id must match the body id.
async fn upsert<T: Validate + serde::Serialize + DeserializeOwned>(
    ctx: &AppCtx, user: &str, kind: Kind, id: &str, item: T,
) -> ApiResult<Json<T>> {
    if item.id() != id { return Err(ApiError::BadRequest("path id and body id differ".into())); }
    item.validate().map_err(ApiError::BadRequest)?;
    ctx.repo.put(user, kind, id, &item).await?;
    Ok(Json(item))
}

async fn put_exercise(State(c): Ctx, UserId(u): UserId, Path(id): Path<String>, Json(b): Json<Exercise>) -> ApiResult<Json<Exercise>> {
    upsert(&c, &u, Kind::Exercise, &id, b).await
}
async fn put_routine(State(c): Ctx, UserId(u): UserId, Path(id): Path<String>, Json(b): Json<Routine>) -> ApiResult<Json<Routine>> {
    upsert(&c, &u, Kind::Routine, &id, b).await
}
async fn put_plan(State(c): Ctx, UserId(u): UserId, Path(id): Path<String>, Json(b): Json<Plan>) -> ApiResult<Json<Plan>> {
    upsert(&c, &u, Kind::Plan, &id, b).await
}
async fn put_session(State(c): Ctx, UserId(u): UserId, Path(id): Path<String>, Json(b): Json<Session>) -> ApiResult<Json<Session>> {
    upsert(&c, &u, Kind::Session, &id, b).await
}

async fn put_day(State(c): Ctx, UserId(u): UserId, Path(id): Path<String>, Json(b): Json<DayLog>) -> ApiResult<Json<DayLog>> {
    upsert(&c, &u, Kind::Day, &id, b).await
}
async fn put_weight(State(c): Ctx, UserId(u): UserId, Path(id): Path<String>, Json(b): Json<WeightEntry>) -> ApiResult<Json<WeightEntry>> {
    upsert(&c, &u, Kind::Weight, &id, b).await
}

async fn del_exercise(State(c): Ctx, UserId(u): UserId, Path(id): Path<String>) -> ApiResult<StatusCode> {
    c.repo.delete_exercise(&u, &id).await?;
    Ok(StatusCode::NO_CONTENT)
}
async fn del_routine(State(c): Ctx, UserId(u): UserId, Path(id): Path<String>) -> ApiResult<StatusCode> {
    c.repo.delete_routine(&u, &id).await?;
    Ok(StatusCode::NO_CONTENT)
}
async fn del_plan(State(c): Ctx, UserId(u): UserId, Path(id): Path<String>) -> ApiResult<StatusCode> {
    c.repo.delete(&u, Kind::Plan, &id).await?;
    Ok(StatusCode::NO_CONTENT)
}
async fn del_session(State(c): Ctx, UserId(u): UserId, Path(id): Path<String>) -> ApiResult<StatusCode> {
    c.repo.delete(&u, Kind::Session, &id).await?;
    Ok(StatusCode::NO_CONTENT)
}

async fn del_day(State(c): Ctx, UserId(u): UserId, Path(id): Path<String>) -> ApiResult<StatusCode> {
    c.repo.delete(&u, Kind::Day, &id).await?;
    Ok(StatusCode::NO_CONTENT)
}
async fn del_weight(State(c): Ctx, UserId(u): UserId, Path(id): Path<String>) -> ApiResult<StatusCode> {
    c.repo.delete(&u, Kind::Weight, &id).await?;
    Ok(StatusCode::NO_CONTENT)
}

async fn get_settings(State(c): Ctx, UserId(u): UserId) -> ApiResult<Json<Settings>> {
    Ok(Json(c.repo.get_settings(&u).await?))
}
async fn put_settings(State(c): Ctx, UserId(u): UserId, Json(s): Json<Settings>) -> ApiResult<Json<Settings>> {
    s.validate().map_err(ApiError::BadRequest)?;
    c.repo.put_settings(&u, &s).await?;
    Ok(Json(s))
}

// ---- AI (Amazon Bedrock) ----

async fn ai_models(State(c): Ctx, UserId(_): UserId) -> ApiResult<Json<Value>> {
    Ok(Json(json!({ "models": c.ai.models().await? })))
}

#[derive(serde::Deserialize)]
struct ReviewReq { model: String, prompt: String }

async fn ai_review(State(c): Ctx, UserId(u): UserId, Json(r): Json<ReviewReq>) -> ApiResult<Json<Value>> {
    if r.prompt.trim().is_empty() || r.prompt.chars().count() > ai::MAX_PROMPT_CHARS {
        return Err(ApiError::BadRequest(format!("prompt must be 1-{} characters", ai::MAX_PROMPT_CHARS)));
    }
    // Only models from our filtered list (never Anthropic via Bedrock, never unauthorized ones).
    if !c.ai.models().await?.iter().any(|m| m.id == r.model) {
        return Err(ApiError::BadRequest("model not available".into()));
    }
    let today = chrono::Utc::now().format("%Y-%m-%d").to_string();
    if c.repo.bump_ai_usage(&u, &today, auth::now() + 2 * 86_400).await? > ai::DAILY_LIMIT {
        return Err(ApiError::TooManyRequests(format!("daily AI limit of {} requests reached", ai::DAILY_LIMIT)));
    }
    let answer = c.ai.review(&r.model, &r.prompt).await?;
    Ok(Json(json!({ "answer": answer, "model": r.model })))
}

// ---- Web Push ----

fn vapid(c: &AppCtx) -> ApiResult<&push::Vapid> {
    c.vapid.as_ref().ok_or(ApiError::Unavailable("push notifications are not configured on this server".into()))
}

async fn push_public_key(State(c): Ctx) -> ApiResult<Json<Value>> {
    Ok(Json(json!({ "publicKey": vapid(&c)?.public_key })))
}

#[derive(serde::Deserialize)]
struct SubKeys { p256dh: String, auth: String }
#[derive(serde::Deserialize)]
struct SubReq { endpoint: String, #[serde(default)] keys: Option<SubKeys> }

/// Browsers' push services only — the server POSTs to this URL, so arbitrary hosts would be an SSRF hole.
fn allowed_endpoint(endpoint: &str) -> bool {
    const HOSTS: [&str; 5] = ["fcm.googleapis.com", "push.services.mozilla.com", "push.apple.com", "notify.windows.com", "push.api.chrome.google.com"];
    let Some(rest) = endpoint.strip_prefix("https://") else { return false };
    let host = rest.split(['/', ':', '?']).next().unwrap_or_default().to_ascii_lowercase();
    endpoint.len() <= 1024 && HOSTS.iter().any(|h| host == *h || host.ends_with(&format!(".{h}")))
}

async fn push_subscribe(State(c): Ctx, UserId(u): UserId, Json(r): Json<SubReq>) -> ApiResult<StatusCode> {
    vapid(&c)?;
    let keys = r.keys.ok_or(ApiError::BadRequest("missing keys".into()))?;
    if !allowed_endpoint(&r.endpoint) { return Err(ApiError::BadRequest("unsupported push endpoint".into())); }
    if keys.p256dh.len() > 200 || keys.auth.len() > 64 { return Err(ApiError::BadRequest("invalid keys".into())); }
    c.repo.put_push_subscription(&u, &db::PushSubscription { endpoint: r.endpoint, p256dh: keys.p256dh, auth: keys.auth }).await?;
    Ok(StatusCode::NO_CONTENT)
}

async fn push_unsubscribe(State(c): Ctx, UserId(u): UserId, Json(r): Json<SubReq>) -> ApiResult<StatusCode> {
    c.repo.delete_push_subscription(&u, &r.endpoint).await?;
    Ok(StatusCode::NO_CONTENT)
}

async fn push_test(State(c): Ctx, UserId(u): UserId) -> ApiResult<Json<Value>> {
    let n = push::Notification { title: "Training Tracker", body: "Reminders are working. See you at the next session!", url: "/today", tag: "tt-test" };
    let delivered = push::notify_user(&c.repo, &c.http, vapid(&c)?, &u, &n).await?;
    Ok(Json(json!({ "delivered": delivered })))
}

fn cors() -> CorsLayer {
    let origins = std::env::var("CORS_ORIGINS").unwrap_or_else(|_| "*".into());
    let allow = if origins.trim() == "*" {
        AllowOrigin::any()
    } else {
        AllowOrigin::list(origins.split(',').filter_map(|o| HeaderValue::from_str(o.trim()).ok()))
    };
    CorsLayer::new()
        .allow_origin(allow)
        .allow_methods([Method::GET, Method::PUT, Method::POST, Method::DELETE, Method::OPTIONS])
        .allow_headers([axum::http::header::CONTENT_TYPE, axum::http::header::AUTHORIZATION])
}

fn router(ctx: Arc<AppCtx>) -> Router {
    Router::new()
        .route("/health", get(health))
        .route("/auth/login", post(auth::login))
        .route("/auth/me", get(auth::me))
        .route("/state", get(get_state))
        .route("/seed", post(seed))
        .route("/exercises/{id}", put(put_exercise).delete(del_exercise))
        .route("/routines/{id}", put(put_routine).delete(del_routine))
        .route("/plans/{id}", put(put_plan).delete(del_plan))
        .route("/sessions/{id}", put(put_session).delete(del_session))
        .route("/days/{id}", put(put_day).delete(del_day))
        .route("/weights/{id}", put(put_weight).delete(del_weight))
        .route("/settings", get(get_settings).put(put_settings))
        .route("/ai/models", get(ai_models))
        .route("/ai/review", post(ai_review))
        .route("/push/public-key", get(push_public_key))
        .route("/push/subscriptions", post(push_subscribe).delete(push_unsubscribe))
        .route("/push/test", post(push_test))
        .with_state(ctx)
        .layer(cors())
}

/// `api create-user` — idempotently creates CREATE_USER_EMAIL / CREATE_USER_PASSWORD.
/// Credentials come from env vars so the password never shows up in `ps` output.
async fn create_user(repo: &Repo) -> anyhow::Result<()> {
    let email = auth::normalize_email(&std::env::var("CREATE_USER_EMAIL")?).map_err(anyhow::Error::msg)?;
    let password = std::env::var("CREATE_USER_PASSWORD")?;
    auth::validate_password(&password).map_err(anyhow::Error::msg)?;
    let hash = auth::hash_password(&password)?;
    let id = uuid::Uuid::new_v4().simple().to_string();
    let created_at = format!("{}", auth::now());
    if repo.create_credentials(&email, &id, &hash, &created_at).await? {
        println!("created user {email} ({id})");
    } else {
        println!("user {email} already exists, left unchanged");
    }
    Ok(())
}

/// Reads a secret from `<NAME>` (local) or Secrets Manager via `<NAME>_ARN` (Lambda).
async fn secret(conf: &aws_config::SdkConfig, name: &str) -> anyhow::Result<Option<String>> {
    if let Ok(v) = std::env::var(name) { return Ok(Some(v)); }
    let Ok(arn) = std::env::var(format!("{name}_ARN")) else { return Ok(None) };
    let v = aws_sdk_secretsmanager::Client::new(conf).get_secret_value().secret_id(arn).send().await?
        .secret_string.ok_or_else(|| anyhow::anyhow!("{name} secret has no string value"))?;
    Ok(Some(v))
}

async fn load_vapid(conf: &aws_config::SdkConfig) -> anyhow::Result<Option<push::Vapid>> {
    let subject = std::env::var("VAPID_SUBJECT").unwrap_or_else(|_| "mailto:admin@example.com".into());
    secret(conf, "VAPID_PRIVATE_KEY").await?.map(|k| push::Vapid::new(&k, subject)).transpose()
}

#[tokio::main]
async fn main() -> Result<(), lambda_http::Error> {
    tracing_subscriber::fmt()
        .with_env_filter(tracing_subscriber::EnvFilter::try_from_default_env().unwrap_or_else(|_| "info".into()))
        .without_time()
        .init();

    if std::env::args().nth(1).as_deref() == Some("vapid-keygen") {
        println!("{}", push::Vapid::generate_private_key());
        return Ok(());
    }

    let conf = aws_config::load_from_env().await;
    // DynamoDB Local (Docker) only replaces the DynamoDB endpoint; Bedrock etc. still go to AWS.
    let mut ddb = aws_sdk_dynamodb::config::Builder::from(&conf);
    if let Ok(endpoint) = std::env::var("DDB_ENDPOINT") { ddb = ddb.endpoint_url(endpoint); }
    let repo = Repo::new(
        aws_sdk_dynamodb::Client::from_conf(ddb.build()),
        std::env::var("TABLE_NAME").unwrap_or_else(|_| "training-tracker".into()),
    );

    if std::env::args().nth(1).as_deref() == Some("create-user") {
        return Ok(create_user(&repo).await?);
    }

    let http = reqwest::Client::builder().timeout(std::time::Duration::from_secs(10)).build()?;
    let in_lambda = std::env::var("AWS_LAMBDA_RUNTIME_API").is_ok();

    // Scheduled reminders: same binary, TT_MODE=reminders.
    if std::env::var("TT_MODE").as_deref() == Ok("reminders") {
        let vapid = load_vapid(&conf).await?.ok_or_else(|| anyhow::anyhow!("VAPID key required for reminders"))?;
        let (repo, http, vapid) = (Arc::new(repo), Arc::new(http), Arc::new(vapid));
        if in_lambda {
            return lambda_http::lambda_runtime::run(lambda_http::lambda_runtime::service_fn(move |_: lambda_http::lambda_runtime::LambdaEvent<Value>| {
                let (repo, http, vapid) = (repo.clone(), http.clone(), vapid.clone());
                async move {
                    let n = reminders::run(&repo, &http, &vapid, chrono::Utc::now(), 15).await?;
                    tracing::info!(delivered = n, "reminders run");
                    Ok::<_, lambda_http::Error>(json!({ "delivered": n }))
                }
            })).await;
        }
        tracing::info!("reminder loop: checking every minute");
        loop {
            match reminders::run(&repo, &http, &vapid, chrono::Utc::now(), 1).await {
                Ok(n) if n > 0 => tracing::info!(delivered = n, "reminders sent"),
                Ok(_) => {}
                Err(e) => tracing::warn!(error = %e, "reminder run failed"),
            }
            tokio::time::sleep(std::time::Duration::from_secs(60)).await;
        }
    }

    let jwt = secret(&conf, "JWT_SECRET").await?.ok_or_else(|| anyhow::anyhow!("set JWT_SECRET or JWT_SECRET_ARN"))?;
    if jwt.len() < 32 { return Err(anyhow::anyhow!("JWT secret must be at least 32 bytes").into()); }
    let ctx = Arc::new(AppCtx {
        repo,
        keys: Keys::new(jwt.as_bytes()),
        dummy_hash: auth::hash_password(&uuid::Uuid::new_v4().to_string())?,
        ai: ai::Ai::new(&conf),
        vapid: load_vapid(&conf).await?,
        http,
    });
    let app = router(ctx);

    if in_lambda {
        lambda_http::run(app).await
    } else {
        let addr = format!("0.0.0.0:{}", std::env::var("PORT").unwrap_or_else(|_| "3000".into()));
        tracing::info!("listening on http://{addr}");
        let listener = tokio::net::TcpListener::bind(&addr).await?;
        axum::serve(listener, app).await?;
        Ok(())
    }
}
