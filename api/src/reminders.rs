//! Routine reminders, run on a schedule (every 15 min on AWS, every minute locally).
use crate::{db::Repo, model::AppState, push::{self, Notification, Vapid}};
use anyhow::Result;
use chrono::{DateTime, Datelike, Timelike, Utc};

fn minutes(hhmm: &str) -> u32 { hhmm[..2].parse::<u32>().unwrap_or(0) * 60 + hhmm[3..].parse::<u32>().unwrap_or(0) }

/// True when a reminder slot (start, start+step, … ≤ end) falls in (now - window, now].
fn slot_due(start: u32, end: u32, step: u32, now_min: u32, window_min: u32) -> bool {
    (start..=end).step_by(step.max(1) as usize).any(|s| s <= now_min && now_min - s < window_min)
}

/// Routines scheduled on `date` that still have unlogged sets: (routine name, done, total).
fn pending(state: &AppState, date: &str, weekday: &str, day_of_month: u32) -> Vec<(String, usize, usize)> {
    state.plans.iter().filter(|p| p.subscribed).filter_map(|p| {
        let key = match p.kind { crate::model::PlanKind::Weekly => weekday.to_owned(), crate::model::PlanKind::Monthly => day_of_month.to_string() };
        let rid = p.days.get(&key)?.as_ref()?;
        let routine = state.routines.iter().find(|r| &r.id == rid)?;
        let total: usize = routine.exercises.iter().map(|e| e.goals.len()).sum();
        let done = state.sessions.iter()
            .find(|s| s.date == date && s.plan_id.as_deref() == Some(&p.id) && s.routine_id.as_deref() == Some(rid))
            .map_or(0, |s| s.logs.len());
        (done < total).then(|| (routine.name.clone(), done, total))
    }).collect()
}

/// Sends every reminder whose slot falls in (now - window, now]. Returns notifications delivered.
pub async fn run(repo: &Repo, http: &reqwest::Client, vapid: &Vapid, now: DateTime<Utc>, window_min: u32) -> Result<usize> {
    let mut delivered = 0;
    for user in repo.reminder_users().await? {
        let settings = repo.get_settings(&user).await?;
        let r = &settings.reminders;
        if !r.enabled { continue; }
        let tz: chrono_tz::Tz = r.timezone.parse().unwrap_or(chrono_tz::UTC);
        let local = now.with_timezone(&tz);
        let now_min = local.hour() * 60 + local.minute();
        if !slot_due(minutes(&r.start), minutes(&r.end), r.every_hours.max(1) * 60, now_min, window_min) { continue; }

        let date = local.format("%Y-%m-%d").to_string();
        let weekday = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"][local.weekday().num_days_from_monday() as usize];
        let body = if r.only_when_due {
            let state = repo.load_state(&user).await?;
            let todo = pending(&state, &date, weekday, local.day());
            if todo.is_empty() { continue; }
            todo.iter().map(|(n, d, t)| format!("{n}: {d}/{t} sets")).collect::<Vec<_>>().join(" · ")
        } else {
            "Time to train — log today's sets.".to_owned()
        };
        let n = Notification { title: "Training reminder", body: &body, url: "/today", tag: "tt-reminder" };
        match push::notify_user(repo, http, vapid, &user, &n).await {
            Ok(k) => delivered += k,
            Err(e) => tracing::warn!(error = %e, "reminder failed"),
        }
    }
    Ok(delivered)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn slots_fire_once_per_window() {
        // 08:00-20:00 every 4h → 08:00, 12:00, 16:00, 20:00; scheduler runs every 15 min.
        let (start, end, step) = (8 * 60, 20 * 60, 240);
        assert!(slot_due(start, end, step, 8 * 60, 15));        // exactly on time
        assert!(slot_due(start, end, step, 8 * 60 + 14, 15));   // late invocation, same window
        assert!(!slot_due(start, end, step, 8 * 60 + 15, 15));  // next window: no duplicate
        assert!(!slot_due(start, end, step, 7 * 60 + 59, 15));  // before the first slot
        assert!(slot_due(start, end, step, 20 * 60 + 5, 15));   // last slot included
        assert!(!slot_due(start, end, step, 10 * 60, 15));      // between slots
        assert!(slot_due(start, end, 60, 13 * 60 + 1, 15));     // hourly
    }

    #[test]
    fn minutes_parses_hhmm() {
        assert_eq!(minutes("00:00"), 0);
        assert_eq!(minutes("07:30"), 450);
        assert_eq!(minutes("23:59"), 1439);
    }
}
