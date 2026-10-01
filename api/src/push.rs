//! Web Push (RFC 8030/8291/8292): VAPID-signed, end-to-end encrypted notifications.
use crate::db::{PushSubscription, Repo};
use anyhow::{Context, Result};
use base64ct::{Base64UrlUnpadded, Encoding};
use web_push_native::{jwt_simple::algorithms::{ECDSAP256PublicKeyLike, ES256KeyPair}, p256::PublicKey, Auth, WebPushBuilder};

pub struct Vapid {
    key: ES256KeyPair,
    subject: String,
    /// Uncompressed P-256 public key, base64url — the browser's `applicationServerKey`.
    pub public_key: String,
}

impl Vapid {
    /// `private_b64` is the raw 32-byte P-256 private key, base64url (see `api vapid-keygen`).
    pub fn new(private_b64: &str, subject: String) -> Result<Self> {
        let key = ES256KeyPair::from_bytes(&Base64UrlUnpadded::decode_vec(private_b64.trim()).map_err(|e| anyhow::anyhow!("{e}"))?)
            .map_err(|e| anyhow::anyhow!("invalid VAPID key: {e}"))?;
        let public_key = Base64UrlUnpadded::encode_string(&key.public_key().public_key().to_bytes_uncompressed());
        Ok(Self { key, subject, public_key })
    }

    pub fn generate_private_key() -> String {
        Base64UrlUnpadded::encode_string(&ES256KeyPair::generate().to_bytes())
    }
}

#[derive(serde::Serialize)]
pub struct Notification<'a> {
    pub title: &'a str,
    pub body: &'a str,
    /// Path to open when the notification is tapped.
    pub url: &'a str,
    /// Notifications with the same tag replace each other instead of piling up.
    pub tag: &'a str,
}

/// Sends to one subscription. Returns Ok(false) when the push service says it's gone (404/410).
async fn send_one(http: &reqwest::Client, vapid: &Vapid, sub: &PushSubscription, payload: &[u8]) -> Result<bool> {
    let decode = |s: &str| Base64UrlUnpadded::decode_vec(s).map_err(|e| anyhow::anyhow!("{e}"));
    let auth = decode(&sub.auth)?;
    anyhow::ensure!(auth.len() == 16, "bad auth secret");
    let req = WebPushBuilder::new(
        sub.endpoint.parse().context("endpoint")?,
        PublicKey::from_sec1_bytes(&decode(&sub.p256dh)?).context("p256dh")?,
        Auth::clone_from_slice(&auth),
    )
    .with_vapid(&vapid.key, &vapid.subject)
    .build(payload.to_vec())
    .map_err(|e| anyhow::anyhow!("build push: {e}"))?;

    let (parts, body) = req.into_parts();
    let mut out = http.post(parts.uri.to_string()).body(body);
    for (k, v) in parts.headers.iter() { out = out.header(k.as_str(), v.as_bytes()); }
    let res = out.header("TTL", "3600").header("Urgency", "normal").send().await.context("push send")?;
    match res.status().as_u16() {
        200..=299 => Ok(true),
        404 | 410 => Ok(false),
        code => anyhow::bail!("push service returned {code}: {}", res.text().await.unwrap_or_default()),
    }
}

/// Sends to every device of `user`; expired subscriptions are deleted. Returns how many were delivered.
pub async fn notify_user(repo: &Repo, http: &reqwest::Client, vapid: &Vapid, user: &str, n: &Notification<'_>) -> Result<usize> {
    let payload = serde_json::to_vec(n)?;
    let mut delivered = 0;
    for sub in repo.push_subscriptions(user).await? {
        match send_one(http, vapid, &sub, &payload).await {
            Ok(true) => delivered += 1,
            Ok(false) => repo.delete_push_subscription(user, &sub.endpoint).await?,
            Err(e) => tracing::warn!(error = %e, "push failed"),
        }
    }
    Ok(delivered)
}
