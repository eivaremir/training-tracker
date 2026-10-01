//! DynamoDB single-table access.
//!
//! | pk            | sk                 | data      |
//! |---------------|--------------------|-----------|
//! | USER#<userId> | EXERCISE#<id>      | Exercise  |
//! | USER#<userId> | ROUTINE#<id>       | Routine   |
//! | USER#<userId> | PLAN#<id>          | Plan      |
//! | USER#<userId> | SESSION#<id>       | Session (with embedded set logs + goal snapshots) |
//! | USER#<userId> | DAY#<date>         | DayLog (notes + AI reviews) |
//! | USER#<userId> | WEIGHT#<date>      | WeightEntry |
//! | USER#<userId> | SETTINGS           | Settings; gsi1pk=REMINDERS while reminders are on |
//! | USER#<userId> | PUSH#<hash>        | Web Push subscription (top-level attributes) |
//! | USER#<userId> | AIUSAGE#<date>     | AI request counter (expires via ttl) |
//! | EMAIL#<email> | CREDENTIALS        | userId, passwordHash, failedAttempts, lockedUntil (top-level attributes) |
//!
//! GSI `gsi1` (gsi1pk, gsi1sk) lists users with reminders enabled.
use crate::model::{AppState, Plan, Routine, Settings};
use anyhow::{Context, Result};
use aws_sdk_dynamodb::{
    types::{AttributeValue, PutRequest, WriteRequest},
    Client,
};
use serde::{de::DeserializeOwned, Serialize};
use std::collections::HashMap;

#[derive(Clone, Copy, Debug)]
pub enum Kind {
    Exercise,
    Routine,
    Plan,
    Session,
    Day,
    Weight,
}

impl Kind {
    fn prefix(self) -> &'static str {
        match self {
            Kind::Exercise => "EXERCISE#",
            Kind::Routine => "ROUTINE#",
            Kind::Plan => "PLAN#",
            Kind::Session => "SESSION#",
            Kind::Day => "DAY#",
            Kind::Weight => "WEIGHT#",
        }
    }
}

type Item = HashMap<String, AttributeValue>;

pub struct Repo {
    client: Client,
    table: String,
}

fn pk(user: &str) -> AttributeValue { AttributeValue::S(format!("USER#{user}")) }
fn sk(kind: Kind, id: &str) -> AttributeValue { AttributeValue::S(format!("{}{id}", kind.prefix())) }

impl Repo {
    pub fn new(client: Client, table: String) -> Self { Self { client, table } }

    fn item<T: Serialize>(user: &str, kind: Kind, id: &str, value: &T) -> Result<Item> {
        Ok(HashMap::from([
            ("pk".to_owned(), pk(user)),
            ("sk".to_owned(), sk(kind, id)),
            ("data".to_owned(), serde_dynamo::to_attribute_value(value)?),
        ]))
    }

    pub async fn put<T: Serialize>(&self, user: &str, kind: Kind, id: &str, value: &T) -> Result<()> {
        self.client.put_item().table_name(&self.table)
            .set_item(Some(Self::item(user, kind, id, value)?))
            .send().await.context("put_item")?;
        Ok(())
    }

    pub async fn delete(&self, user: &str, kind: Kind, id: &str) -> Result<()> {
        self.client.delete_item().table_name(&self.table)
            .key("pk", pk(user)).key("sk", sk(kind, id))
            .send().await.context("delete_item")?;
        Ok(())
    }

    async fn query(&self, user: &str, prefix: Option<&str>) -> Result<Vec<Item>> {
        let mut q = self.client.query().table_name(&self.table)
            .expression_attribute_values(":pk", pk(user));
        q = match prefix {
            Some(p) => q.key_condition_expression("pk = :pk AND begins_with(sk, :sk)")
                .expression_attribute_values(":sk", AttributeValue::S(p.to_owned())),
            None => q.key_condition_expression("pk = :pk"),
        };
        let items: Vec<Item> = q.into_paginator().items().send().try_collect().await.context("query")?;
        Ok(items)
    }

    async fn list<T: DeserializeOwned>(&self, user: &str, kind: Kind) -> Result<Vec<T>> {
        self.query(user, Some(kind.prefix())).await?.into_iter().map(decode).collect()
    }

    /// Everything the client needs in one partition query.
    pub async fn load_state(&self, user: &str) -> Result<AppState> {
        let mut state = AppState::default();
        for it in self.query(user, None).await? {
            let sk = it.get("sk").and_then(|v| v.as_s().ok()).cloned().unwrap_or_default();
            match sk.split('#').next() {
                Some("EXERCISE") => state.exercises.push(decode(it)?),
                Some("ROUTINE") => state.routines.push(decode(it)?),
                Some("PLAN") => state.plans.push(decode(it)?),
                Some("SESSION") => state.sessions.push(decode(it)?),
                Some("DAY") => state.days.push(decode(it)?),
                Some("WEIGHT") => state.weights.push(decode(it)?),
                Some("SETTINGS") => state.settings = decode(it)?,
                _ => {}
            }
        }
        state.sessions.sort_by(|a, b| a.date.cmp(&b.date).then(a.started_at.cmp(&b.started_at)));
        state.weights.sort_by(|a, b| a.date.cmp(&b.date));
        Ok(state)
    }

    /// Deleting an exercise also removes it from every routine that uses it.
    pub async fn delete_exercise(&self, user: &str, id: &str) -> Result<()> {
        self.delete(user, Kind::Exercise, id).await?;
        for mut r in self.list::<Routine>(user, Kind::Routine).await? {
            let before = r.exercises.len();
            r.exercises.retain(|x| x.exercise_id != id);
            if r.exercises.len() != before {
                r.exercises.iter_mut().enumerate().for_each(|(i, x)| x.order = i as u32);
                self.put(user, Kind::Routine, &r.id.clone(), &r).await?;
            }
        }
        Ok(())
    }

    /// Deleting a routine turns every plan day that referenced it into a rest day.
    pub async fn delete_routine(&self, user: &str, id: &str) -> Result<()> {
        self.delete(user, Kind::Routine, id).await?;
        for mut p in self.list::<Plan>(user, Kind::Plan).await? {
            let mut changed = false;
            for v in p.days.values_mut() {
                if v.as_deref() == Some(id) { *v = None; changed = true; }
            }
            if changed { self.put(user, Kind::Plan, &p.id.clone(), &p).await?; }
        }
        Ok(())
    }

    /// Bulk upsert (used to load demo data). BatchWriteItem takes 25 items per call.
    pub async fn seed(&self, user: &str, s: &AppState) -> Result<()> {
        let mut items = Vec::new();
        for x in &s.exercises { items.push(Self::item(user, Kind::Exercise, &x.id, x)?); }
        for x in &s.routines { items.push(Self::item(user, Kind::Routine, &x.id, x)?); }
        for x in &s.plans { items.push(Self::item(user, Kind::Plan, &x.id, x)?); }
        for x in &s.sessions { items.push(Self::item(user, Kind::Session, &x.id, x)?); }
        for x in &s.days { items.push(Self::item(user, Kind::Day, &x.id, x)?); }
        for x in &s.weights { items.push(Self::item(user, Kind::Weight, &x.id, x)?); }

        for chunk in items.chunks(25) {
            let mut reqs: Vec<WriteRequest> = chunk.iter()
                .map(|it| Ok(WriteRequest::builder().put_request(PutRequest::builder().set_item(Some(it.clone())).build()?).build()))
                .collect::<Result<_>>()?;
            for attempt in 0..8u32 {
                if reqs.is_empty() { break; }
                let out = self.client.batch_write_item()
                    .request_items(&self.table, reqs)
                    .send().await.context("batch_write_item")?;
                reqs = out.unprocessed_items.and_then(|mut m| m.remove(&self.table)).unwrap_or_default();
                if !reqs.is_empty() {
                    tokio::time::sleep(std::time::Duration::from_millis(50 * 2u64.pow(attempt))).await;
                }
            }
            anyhow::ensure!(reqs.is_empty(), "batch write left unprocessed items");
        }
        Ok(())
    }
}

pub struct Credentials {
    pub user_id: String,
    pub email: String,
    pub password_hash: String,
    pub failed_attempts: u32,
    pub locked_until: u64,
}

fn cred_key(email: &str) -> [(String, AttributeValue); 2] {
    [
        ("pk".to_owned(), AttributeValue::S(format!("EMAIL#{email}"))),
        ("sk".to_owned(), AttributeValue::S("CREDENTIALS".into())),
    ]
}

fn attr_s(it: &Item, k: &str) -> Option<String> { it.get(k).and_then(|v| v.as_s().ok()).cloned() }
fn attr_n<T: std::str::FromStr + Default>(it: &Item, k: &str) -> T {
    it.get(k).and_then(|v| v.as_n().ok()).and_then(|n| n.parse().ok()).unwrap_or_default()
}

impl Repo {
    pub async fn get_credentials(&self, email: &str) -> Result<Option<Credentials>> {
        let out = self.client.get_item().table_name(&self.table)
            .set_key(Some(cred_key(email).into_iter().collect()))
            .consistent_read(true)
            .send().await.context("get_item credentials")?;
        Ok(out.item.map(|it| Credentials {
            user_id: attr_s(&it, "userId").unwrap_or_default(),
            email: attr_s(&it, "email").unwrap_or_default(),
            password_hash: attr_s(&it, "passwordHash").unwrap_or_default(),
            failed_attempts: attr_n(&it, "failedAttempts"),
            locked_until: attr_n(&it, "lockedUntil"),
        }))
    }

    /// Creates the credentials record; returns false if the email is already registered.
    pub async fn create_credentials(&self, email: &str, user_id: &str, password_hash: &str, created_at: &str) -> Result<bool> {
        let mut item: Item = cred_key(email).into_iter().collect();
        item.insert("userId".into(), AttributeValue::S(user_id.into()));
        item.insert("email".into(), AttributeValue::S(email.into()));
        item.insert("passwordHash".into(), AttributeValue::S(password_hash.into()));
        item.insert("createdAt".into(), AttributeValue::S(created_at.into()));
        item.insert("failedAttempts".into(), AttributeValue::N("0".into()));
        item.insert("lockedUntil".into(), AttributeValue::N("0".into()));
        let res = self.client.put_item().table_name(&self.table).set_item(Some(item))
            .condition_expression("attribute_not_exists(pk)")
            .send().await;
        match res {
            Ok(_) => Ok(true),
            Err(e) if e.as_service_error().is_some_and(|s| s.is_conditional_check_failed_exception()) => Ok(false),
            Err(e) => Err(e).context("put_item credentials"),
        }
    }

    /// Atomically increments the failed-login counter and returns the new value.
    pub async fn record_failed_login(&self, email: &str) -> Result<u32> {
        let out = self.client.update_item().table_name(&self.table)
            .set_key(Some(cred_key(email).into_iter().collect()))
            .update_expression("ADD failedAttempts :one")
            .condition_expression("attribute_exists(pk)")
            .expression_attribute_values(":one", AttributeValue::N("1".into()))
            .return_values(aws_sdk_dynamodb::types::ReturnValue::UpdatedNew)
            .send().await.context("record_failed_login")?;
        Ok(out.attributes.as_ref().map_or(0, |a| attr_n(a, "failedAttempts")))
    }

    pub async fn lock_account(&self, email: &str, until: u64) -> Result<()> {
        self.client.update_item().table_name(&self.table)
            .set_key(Some(cred_key(email).into_iter().collect()))
            .update_expression("SET lockedUntil = :u, failedAttempts = :z")
            .expression_attribute_values(":u", AttributeValue::N(until.to_string()))
            .expression_attribute_values(":z", AttributeValue::N("0".into()))
            .send().await.context("lock_account")?;
        Ok(())
    }

    pub async fn reset_failed_logins(&self, email: &str) -> Result<()> {
        self.client.update_item().table_name(&self.table)
            .set_key(Some(cred_key(email).into_iter().collect()))
            .update_expression("SET failedAttempts = :z")
            .expression_attribute_values(":z", AttributeValue::N("0".into()))
            .send().await.context("reset_failed_logins")?;
        Ok(())
    }
}

pub struct PushSubscription {
    pub endpoint: String,
    pub p256dh: String,
    pub auth: String,
}

fn user_key(user: &str, sk: String) -> Item {
    HashMap::from([("pk".to_owned(), pk(user)), ("sk".to_owned(), AttributeValue::S(sk))])
}

/// Short stable id for a push endpoint (FNV-1a; not security sensitive, just a key).
fn endpoint_key(endpoint: &str) -> String {
    let mut h: u64 = 0xcbf29ce484222325;
    for b in endpoint.bytes() { h = (h ^ b as u64).wrapping_mul(0x100000001b3); }
    format!("PUSH#{h:016x}")
}

impl Repo {
    pub async fn get_settings(&self, user: &str) -> Result<Settings> {
        let out = self.client.get_item().table_name(&self.table)
            .set_key(Some(user_key(user, "SETTINGS".into()))).send().await.context("get settings")?;
        out.item.map(decode).transpose().map(Option::unwrap_or_default)
    }

    /// Stores settings; users with reminders on are indexed in gsi1 so the scheduler can find them.
    pub async fn put_settings(&self, user: &str, s: &Settings) -> Result<()> {
        let mut item = user_key(user, "SETTINGS".into());
        item.insert("data".into(), serde_dynamo::to_attribute_value(s)?);
        if s.reminders.enabled {
            item.insert("gsi1pk".into(), AttributeValue::S("REMINDERS".into()));
            item.insert("gsi1sk".into(), AttributeValue::S(user.into()));
        }
        self.client.put_item().table_name(&self.table).set_item(Some(item)).send().await.context("put settings")?;
        Ok(())
    }

    /// User ids with reminders enabled.
    pub async fn reminder_users(&self) -> Result<Vec<String>> {
        let items: Vec<Item> = self.client.query().table_name(&self.table).index_name("gsi1")
            .key_condition_expression("gsi1pk = :r")
            .expression_attribute_values(":r", AttributeValue::S("REMINDERS".into()))
            .into_paginator().items().send().try_collect().await.context("query reminders")?;
        Ok(items.iter().filter_map(|i| attr_s(i, "gsi1sk")).collect())
    }

    pub async fn put_push_subscription(&self, user: &str, sub: &PushSubscription) -> Result<()> {
        let mut item = user_key(user, endpoint_key(&sub.endpoint));
        item.insert("endpoint".into(), AttributeValue::S(sub.endpoint.clone()));
        item.insert("p256dh".into(), AttributeValue::S(sub.p256dh.clone()));
        item.insert("auth".into(), AttributeValue::S(sub.auth.clone()));
        self.client.put_item().table_name(&self.table).set_item(Some(item)).send().await.context("put push sub")?;
        Ok(())
    }

    pub async fn delete_push_subscription(&self, user: &str, endpoint: &str) -> Result<()> {
        self.client.delete_item().table_name(&self.table)
            .set_key(Some(user_key(user, endpoint_key(endpoint)))).send().await.context("delete push sub")?;
        Ok(())
    }

    pub async fn push_subscriptions(&self, user: &str) -> Result<Vec<PushSubscription>> {
        Ok(self.query(user, Some("PUSH#")).await?.iter().filter_map(|i| Some(PushSubscription {
            endpoint: attr_s(i, "endpoint")?, p256dh: attr_s(i, "p256dh")?, auth: attr_s(i, "auth")?,
        })).collect())
    }

    /// Atomically counts an AI request for `date`; returns the new count. Counters expire after 2 days.
    pub async fn bump_ai_usage(&self, user: &str, date: &str, expires_at: u64) -> Result<u32> {
        let out = self.client.update_item().table_name(&self.table)
            .set_key(Some(user_key(user, format!("AIUSAGE#{date}"))))
            .update_expression("ADD n :one SET #ttl = :ttl")
            .expression_attribute_names("#ttl", "ttl")
            .expression_attribute_values(":one", AttributeValue::N("1".into()))
            .expression_attribute_values(":ttl", AttributeValue::N(expires_at.to_string()))
            .return_values(aws_sdk_dynamodb::types::ReturnValue::UpdatedNew)
            .send().await.context("bump ai usage")?;
        Ok(out.attributes.as_ref().map_or(0, |a| attr_n(a, "n")))
    }
}

fn decode<T: DeserializeOwned>(mut it: Item) -> Result<T> {
    let data = it.remove("data").context("item without data attribute")?;
    Ok(serde_dynamo::from_attribute_value(data)?)
}
