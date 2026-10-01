//! Entity shapes — the exact JSON the Svelte client sends (camelCase).
use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct Muscles {
    pub primary: Vec<String>,
    pub secondary: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Exercise {
    pub id: String,
    pub name: String,
    pub photo_url: Option<String>,
    #[serde(default)]
    pub notes: String,
    #[serde(default)]
    pub muscles: Muscles,
    pub created_at: String,
    #[serde(default)]
    pub equipment: Vec<String>,
    #[serde(default)]
    pub instructions: Vec<String>,
    #[serde(default)]
    pub images: Vec<String>,
    #[serde(default)]
    pub level: Option<String>,
    #[serde(default)]
    pub category: Option<String>,
    #[serde(default)]
    pub source_id: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SetGoal {
    pub reps: f64,
    pub weight: f64,
    pub rest_seconds: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RoutineExercise {
    pub exercise_id: String,
    pub order: u32,
    pub goals: Vec<SetGoal>,
    pub goal_updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Routine {
    pub id: String,
    pub name: String,
    pub exercises: Vec<RoutineExercise>,
}

#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum PlanKind {
    Weekly,
    Monthly,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Plan {
    pub id: String,
    pub name: String,
    pub kind: PlanKind,
    pub subscribed: bool,
    pub started_at: Option<String>,
    /// weekly: "mon".."sun"; monthly: "1".."31" → routineId or null (rest day).
    pub days: BTreeMap<String, Option<String>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Actual {
    pub reps: f64,
    pub weight: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SetLog {
    pub session_id: String,
    pub exercise_id: String,
    pub set_index: u32,
    /// Goal at log time; absent for extra (unplanned) sets.
    #[serde(default)]
    pub goal_snapshot: Option<SetGoal>,
    pub actual: Option<Actual>,
    pub hit_goal: bool,
    pub logged_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Session {
    pub id: String,
    /// Plan and routine are absent for extra workouts logged outside a plan.
    #[serde(default)]
    pub plan_id: Option<String>,
    #[serde(default)]
    pub routine_id: Option<String>,
    pub date: String,
    pub started_at: String,
    pub ended_at: Option<String>,
    pub logs: Vec<SetLog>,
    #[serde(default)]
    pub notes: String,
}

/// One AI answer about a day's training.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AiReview {
    pub id: String,
    pub created_at: String,
    pub provider: String,
    pub model: String,
    pub question: String,
    pub answer: String,
}

/// Per-day journal: notes and saved AI reviews. `id` is the date.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DayLog {
    pub id: String,
    pub date: String,
    #[serde(default)]
    pub notes: String,
    #[serde(default)]
    pub reviews: Vec<AiReview>,
}

/// Body-weight measurement. `id` is the date (one entry per day).
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WeightEntry {
    pub id: String,
    pub date: String,
    pub kg: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Reminders {
    pub enabled: bool,
    /// Local "HH:MM" window and step between reminders.
    pub start: String,
    pub end: String,
    pub every_hours: u32,
    /// Only remind when a scheduled routine still has unlogged sets today.
    pub only_when_due: bool,
    /// IANA zone from the browser, e.g. "America/Los_Angeles".
    pub timezone: String,
}

impl Default for Reminders {
    fn default() -> Self {
        Self { enabled: false, start: "08:00".into(), end: "20:00".into(), every_hours: 4, only_when_due: true, timezone: "UTC".into() }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct Settings {
    #[serde(default)]
    pub weight_goal_kg: Option<f64>,
    /// "bedrock" | "anthropic"
    #[serde(default)]
    pub ai_provider: Option<String>,
    #[serde(default)]
    pub ai_model: Option<String>,
    #[serde(default)]
    pub reminders: Reminders,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct AppState {
    pub exercises: Vec<Exercise>,
    pub routines: Vec<Routine>,
    pub plans: Vec<Plan>,
    pub sessions: Vec<Session>,
    #[serde(default)]
    pub days: Vec<DayLog>,
    #[serde(default)]
    pub weights: Vec<WeightEntry>,
    #[serde(default)]
    pub settings: Settings,
}

/// Basic invariants enforced before anything is written.
pub trait Validate {
    fn id(&self) -> &str;
    fn validate(&self) -> Result<(), String>;
}

fn valid_id(id: &str) -> Result<(), String> {
    let ok = !id.is_empty() && id.len() <= 64 && id.chars().all(|c| c.is_ascii_alphanumeric() || c == '_' || c == '-');
    ok.then_some(()).ok_or_else(|| format!("invalid id `{id}`"))
}

fn short_token(s: &str) -> bool {
    !s.is_empty() && s.len() <= 40 && s.chars().all(|c| c.is_ascii_alphanumeric() || c == '_')
}

fn valid_name(name: &str) -> Result<(), String> {
    (!name.trim().is_empty() && name.len() <= 120).then_some(()).ok_or_else(|| "name must be 1-120 chars".into())
}

fn valid_date(d: &str) -> Result<(), String> {
    let b = d.as_bytes();
    let ok = b.len() == 10 && b[4] == b'-' && b[7] == b'-' && d.chars().enumerate().all(|(i, c)| i == 4 || i == 7 || c.is_ascii_digit());
    ok.then_some(()).ok_or_else(|| "date must be YYYY-MM-DD".into())
}

fn valid_hhmm(t: &str) -> bool {
    t.len() == 5 && t.as_bytes()[2] == b':'
        && t[..2].parse::<u32>().is_ok_and(|h| h < 24) && t[3..].parse::<u32>().is_ok_and(|m| m < 60)
}

fn valid_goal(g: &SetGoal) -> Result<(), String> {
    let ok = [g.reps, g.weight, g.rest_seconds].iter().all(|v| v.is_finite() && *v >= 0.0 && *v < 100_000.0);
    ok.then_some(()).ok_or_else(|| "goal values must be finite, non-negative numbers".into())
}

impl Validate for Exercise {
    fn id(&self) -> &str { &self.id }
    fn validate(&self) -> Result<(), String> {
        valid_id(&self.id)?;
        valid_name(&self.name)?;
        if self.notes.len() > 2000 { return Err("notes too long".into()); }
        if self.muscles.primary.len() + self.muscles.secondary.len() > 60 { return Err("too many muscles".into()); }
        if self.equipment.len() > 12 || self.equipment.iter().any(|e| !short_token(e)) {
            return Err("invalid equipment".into());
        }
        if self.instructions.len() > 40 || self.instructions.iter().any(|s| s.len() > 2000) {
            return Err("instructions: up to 40 steps of 2000 chars".into());
        }
        // Images are rendered in <img> tags: only https URLs, no data:/javascript: schemes.
        if self.images.len() > 6 || self.images.iter().any(|u| !u.starts_with("https://") || u.len() > 500) {
            return Err("images must be up to 6 https URLs".into());
        }
        for v in [&self.level, &self.category, &self.source_id].into_iter().flatten() {
            if v.len() > 120 { return Err("field too long".into()); }
        }
        Ok(())
    }
}

impl Validate for Routine {
    fn id(&self) -> &str { &self.id }
    fn validate(&self) -> Result<(), String> {
        valid_id(&self.id)?;
        valid_name(&self.name)?;
        if self.exercises.len() > 50 { return Err("too many exercises".into()); }
        for re in &self.exercises {
            valid_id(&re.exercise_id)?;
            if re.goals.is_empty() || re.goals.len() > 30 { return Err("each exercise needs 1-30 sets".into()); }
            re.goals.iter().try_for_each(valid_goal)?;
        }
        Ok(())
    }
}

impl Validate for Plan {
    fn id(&self) -> &str { &self.id }
    fn validate(&self) -> Result<(), String> {
        valid_id(&self.id)?;
        valid_name(&self.name)?;
        const WEEK: [&str; 7] = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];
        for (k, v) in &self.days {
            let key_ok = match self.kind {
                PlanKind::Weekly => WEEK.contains(&k.as_str()),
                PlanKind::Monthly => k.parse::<u8>().is_ok_and(|d| (1..=31).contains(&d)),
            };
            if !key_ok { return Err(format!("invalid day key `{k}` for {:?} plan", self.kind)); }
            if let Some(rid) = v { valid_id(rid)?; }
        }
        Ok(())
    }
}

impl Validate for Session {
    fn id(&self) -> &str { &self.id }
    fn validate(&self) -> Result<(), String> {
        valid_id(&self.id)?;
        valid_date(&self.date)?;
        if self.plan_id.is_some() != self.routine_id.is_some() { return Err("planId and routineId go together".into()); }
        if let Some(p) = &self.plan_id { valid_id(p)?; }
        if let Some(r) = &self.routine_id { valid_id(r)?; }
        if self.notes.len() > 4000 { return Err("notes too long".into()); }
        if self.logs.len() > 500 { return Err("too many logs".into()); }
        for l in &self.logs {
            valid_id(&l.exercise_id)?;
            if let Some(g) = &l.goal_snapshot { valid_goal(g)?; }
            if let Some(a) = &l.actual {
                valid_goal(&SetGoal { reps: a.reps, weight: a.weight, rest_seconds: 0.0 })?;
            }
        }
        Ok(())
    }
}

impl Validate for DayLog {
    fn id(&self) -> &str { &self.id }
    fn validate(&self) -> Result<(), String> {
        valid_date(&self.date)?;
        if self.id != self.date { return Err("day id must equal its date".into()); }
        if self.notes.len() > 8000 { return Err("notes too long".into()); }
        if self.reviews.len() > 50 { return Err("too many reviews".into()); }
        for r in &self.reviews {
            valid_id(&r.id)?;
            if r.question.len() > 2000 || r.answer.len() > 20000 || r.model.len() > 200 || r.provider.len() > 20 {
                return Err("review too long".into());
            }
        }
        Ok(())
    }
}

impl Validate for WeightEntry {
    fn id(&self) -> &str { &self.id }
    fn validate(&self) -> Result<(), String> {
        valid_date(&self.date)?;
        if self.id != self.date { return Err("weight id must equal its date".into()); }
        (self.kg.is_finite() && (20.0..=400.0).contains(&self.kg)).then_some(()).ok_or_else(|| "kg must be 20-400".into())
    }
}

impl Settings {
    pub fn validate(&self) -> Result<(), String> {
        if let Some(g) = self.weight_goal_kg {
            if !(g.is_finite() && (20.0..=400.0).contains(&g)) { return Err("weight goal must be 20-400 kg".into()); }
        }
        if let Some(p) = &self.ai_provider {
            if p != "bedrock" && p != "anthropic" { return Err("aiProvider must be bedrock or anthropic".into()); }
        }
        if self.ai_model.as_ref().is_some_and(|m| m.len() > 200) { return Err("aiModel too long".into()); }
        let r = &self.reminders;
        if !valid_hhmm(&r.start) || !valid_hhmm(&r.end) || r.start > r.end { return Err("reminder window must be HH:MM, start before end".into()); }
        if !(1..=12).contains(&r.every_hours) { return Err("everyHours must be 1-12".into()); }
        if r.timezone.parse::<chrono_tz::Tz>().is_err() { return Err("unknown timezone".into()); }
        Ok(())
    }
}
