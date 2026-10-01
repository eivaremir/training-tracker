//! Email + password authentication.
//!
//! - Passwords are hashed with Argon2id (PHC string stored in DynamoDB).
//! - Login returns an HS256 JWT (`sub` = userId) that the client sends as `Authorization: Bearer`.
//! - Every data route requires a valid token via the `UserId` extractor.
//! - 5 consecutive failed logins lock the account for 15 minutes.
use crate::{error::{ApiError, ApiResult}, AppCtx};
use argon2::{
    password_hash::{rand_core::OsRng, PasswordHash, PasswordHasher, PasswordVerifier, SaltString},
    Argon2,
};
use axum::{
    extract::{FromRequestParts, State},
    http::{header::AUTHORIZATION, request::Parts},
    Json,
};
use jsonwebtoken::{decode, encode, Algorithm, DecodingKey, EncodingKey, Header, Validation};
use serde::{Deserialize, Serialize};
use std::sync::Arc;
use std::time::{SystemTime, UNIX_EPOCH};

pub const TOKEN_TTL_SECS: u64 = 7 * 24 * 3600;
const MAX_FAILED_ATTEMPTS: u32 = 5;
const LOCKOUT_SECS: u64 = 15 * 60;

pub struct Keys {
    enc: EncodingKey,
    dec: DecodingKey,
}

impl Keys {
    pub fn new(secret: &[u8]) -> Self {
        Self { enc: EncodingKey::from_secret(secret), dec: DecodingKey::from_secret(secret) }
    }
}

#[derive(Debug, Serialize, Deserialize)]
struct Claims {
    sub: String,
    email: String,
    iat: u64,
    exp: u64,
}

pub fn now() -> u64 { SystemTime::now().duration_since(UNIX_EPOCH).map(|d| d.as_secs()).unwrap_or(0) }

pub fn normalize_email(email: &str) -> Result<String, String> {
    let e = email.trim().to_lowercase();
    let ok = e.len() <= 254 && e.split_once('@').is_some_and(|(l, d)| !l.is_empty() && d.contains('.'));
    ok.then_some(e).ok_or_else(|| "invalid email".into())
}

pub fn validate_password(p: &str) -> Result<(), String> {
    (8..=128).contains(&p.chars().count()).then_some(()).ok_or_else(|| "password must be 8-128 characters".into())
}

pub fn hash_password(p: &str) -> anyhow::Result<String> {
    let salt = SaltString::generate(&mut OsRng);
    Ok(Argon2::default().hash_password(p.as_bytes(), &salt).map_err(|e| anyhow::anyhow!("{e}"))?.to_string())
}

fn verify_password(p: &str, phc: &str) -> bool {
    PasswordHash::new(phc).is_ok_and(|h| Argon2::default().verify_password(p.as_bytes(), &h).is_ok())
}

/// Authenticated caller. Extracting it rejects the request with 401 unless it carries a valid token.
pub struct AuthUser {
    pub id: String,
    pub email: String,
}

impl FromRequestParts<Arc<AppCtx>> for AuthUser {
    type Rejection = ApiError;

    async fn from_request_parts(parts: &mut Parts, ctx: &Arc<AppCtx>) -> Result<Self, Self::Rejection> {
        let token = parts.headers.get(AUTHORIZATION)
            .and_then(|v| v.to_str().ok())
            .and_then(|v| v.strip_prefix("Bearer "))
            .ok_or(ApiError::Unauthorized)?;
        let data = decode::<Claims>(token, &ctx.keys.dec, &Validation::new(Algorithm::HS256))
            .map_err(|_| ApiError::Unauthorized)?;
        Ok(AuthUser { id: data.claims.sub, email: data.claims.email })
    }
}

/// Shorthand for handlers that only need the caller's id.
pub struct UserId(pub String);

impl FromRequestParts<Arc<AppCtx>> for UserId {
    type Rejection = ApiError;

    async fn from_request_parts(parts: &mut Parts, ctx: &Arc<AppCtx>) -> Result<Self, Self::Rejection> {
        Ok(UserId(AuthUser::from_request_parts(parts, ctx).await?.id))
    }
}

#[derive(Deserialize)]
pub struct LoginReq {
    email: String,
    password: String,
}

#[derive(Serialize)]
pub struct PublicUser {
    id: String,
    email: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LoginRes {
    token: String,
    expires_at: u64,
    user: PublicUser,
}

pub async fn login(State(ctx): State<Arc<AppCtx>>, Json(req): Json<LoginReq>) -> ApiResult<Json<LoginRes>> {
    let invalid = || ApiError::BadCredentials;
    let email = normalize_email(&req.email).map_err(|_| invalid())?;
    if req.password.len() > 1024 { return Err(invalid()); }

    let cred = ctx.repo.get_credentials(&email).await?;
    // Verify against a dummy hash for unknown emails so timing doesn't reveal which accounts exist.
    let phc = cred.as_ref().map_or(ctx.dummy_hash.clone(), |c| c.password_hash.clone());
    let pw = req.password;
    let ok = tokio::task::spawn_blocking(move || verify_password(&pw, &phc)).await?;

    let Some(cred) = cred else { return Err(invalid()) };
    if cred.locked_until > now() { return Err(ApiError::TooManyAttempts); }
    if !ok {
        let failed = ctx.repo.record_failed_login(&email).await?;
        if failed >= MAX_FAILED_ATTEMPTS {
            ctx.repo.lock_account(&email, now() + LOCKOUT_SECS).await?;
            tracing::warn!(user = %cred.user_id, "account locked after failed logins");
        }
        return Err(invalid());
    }
    if cred.failed_attempts > 0 { ctx.repo.reset_failed_logins(&email).await?; }

    let iat = now();
    let exp = iat + TOKEN_TTL_SECS;
    let claims = Claims { sub: cred.user_id.clone(), email: cred.email.clone(), iat, exp };
    let token = encode(&Header::new(Algorithm::HS256), &claims, &ctx.keys.enc)?;
    Ok(Json(LoginRes { token, expires_at: exp, user: PublicUser { id: cred.user_id, email: cred.email } }))
}

pub async fn me(user: AuthUser) -> Json<PublicUser> {
    Json(PublicUser { id: user.id, email: user.email })
}
