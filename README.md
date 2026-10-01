# Training Tracker

Mobile-first workout tracker built from the Claude Design handoff (`Training Tracker.html`).

```
web/     SvelteKit 2 + Svelte 5 SPA  → AWS Amplify Hosting
api/     Rust (axum + lambda_http)   → AWS Lambda (arm64) behind an API Gateway HTTP API
infra/   CloudFormation/SAM template (Lambda + HTTP API + DynamoDB on-demand) and Amplify settings
scripts/ Deploy, update, status, logs and teardown scripts (AWS CLI + Docker)
docs/    Deployment guide
docker-compose.yml   Local AWS stack: DynamoDB Local + the API as a plain HTTP server
```

## Local development

**1. Backend (Docker).** Starts DynamoDB Local, creates the table (on-demand billing), creates the default user, and runs the API on `:3000` plus the reminders worker. To try the Bedrock AI coach locally, export real AWS credentials first (they're used only for Bedrock):

```bash
eval "$(aws configure export-credentials --format env)" && export AWS_REGION=us-west-2
```

```bash
docker compose up --build -d
```

**2. Frontend.**

```bash
cd web && cp .env.example .env.local && npm install
```

Set `VITE_API_URL=http://localhost:3000` in `web/.env.local`, then:

```bash
npm --prefix web run dev
```

Sign in with the default test user **`test@mailinator.com` / `123456789`**. New accounts start empty; **Stats → Load demo data** seeds 4 weeks of history via `POST /seed`.

To add another local user:

```bash
docker compose run --rm -e CREATE_USER_EMAIL=you@example.com -e CREATE_USER_PASSWORD=choose-a-password seed-user
```

With `VITE_API_URL` empty the app runs fully offline with demo data in `localStorage`. There's no backend to authenticate against in that mode, so login is skipped.

## Deploy to AWS

With the AWS CLI, Docker and Node installed and signed in to AWS:

```bash
cp deploy.env.example deploy.env && ./scripts/up.sh --admin-email you@example.com
```

That creates the whole stack (S3 artifact bucket, DynamoDB on-demand table, Rust Lambda, HTTP API, signing secret, Amplify site) and your first login. **[docs/deploy-aws.md](docs/deploy-aws.md)** covers costs, permissions, updates, custom domains, teardown and troubleshooting.

## Auth

Email + password, implemented in the Rust API so it behaves the same in Docker and on Lambda.

- **Model**: credentials live in the same table at `EMAIL#<email> / CREDENTIALS` (`userId`, Argon2id `passwordHash`, `failedAttempts`, `lockedUntil`). Each user's data is partitioned under `USER#<userId>`, so users can't see each other's data.
- **Login**: `POST /auth/login` returns an HS256 JWT (`sub` = userId, 7-day expiry). The client keeps it in `localStorage` and sends it as `Authorization: Bearer`.
- **Protection**: every data route requires a valid token (`401` otherwise). In the web app, every screen lives in the `(app)` route group whose `+layout.ts` redirects to `/login?next=…`. A `401` mid-session signs the user out and shows "Session expired".
- **Hardening**: unknown emails still run a password check (no timing leak about which accounts exist), the error message is the same either way, 5 consecutive failures lock the account for 15 minutes (`429`), emails are case-insensitive, and passwords must be 8–128 characters.
- **Accounts**: there is no public sign-up endpoint. Locally, use the `seed-user` compose service (see above); on AWS, `./scripts/create-user.sh`.

Known trade-offs: tokens can't be revoked before they expire (rotate the secret to sign everyone out), and a token in `localStorage` can be read by any script that runs on the page, so avoid adding third-party scripts to the frontend.

## API

`/health` and `/auth/login` are public. Everything else requires `Authorization: Bearer <token>` and is scoped to that user. Bodies are the JSON shapes in `web/src/lib/types.ts` (mirrored in `api/src/model.rs`).

| Method | Path | Notes |
|---|---|---|
| GET | `/health` | |
| POST | `/auth/login` | `{ email, password }` → `{ token, expiresAt, user }` |
| GET | `/auth/me` | current user |
| GET | `/state` | exercises, routines, plans, sessions in one partition query |
| POST | `/seed` | bulk upsert (demo data) |
| PUT / DELETE | `/exercises/{id}` | delete also removes it from routines |
| PUT / DELETE | `/routines/{id}` | delete turns plan days that used it into rest days |
| PUT / DELETE | `/plans/{id}` | |
| PUT / DELETE | `/sessions/{id}` | session with embedded set logs and goal snapshots; `planId`/`routineId` null for extra workouts |
| PUT / DELETE | `/days/{date}` | day notes and saved AI reviews |
| PUT / DELETE | `/weights/{date}` | body weight |
| GET / PUT | `/settings` | weight goal, AI provider/model, reminder schedule |
| GET | `/ai/models` | Bedrock models this account can use (no Anthropic) |
| POST | `/ai/review` | `{ model, prompt }` → `{ answer }`, 30/day per user |
| GET | `/push/public-key` | VAPID key for `pushManager.subscribe` |
| POST / DELETE | `/push/subscriptions` | register or remove this device (browser push services only) |
| POST | `/push/test` | send a test notification |

### Table layout

| pk | sk | data |
|---|---|---|
| `USER#<userId>` | `EXERCISE#<id>` | Exercise |
| `USER#<userId>` | `ROUTINE#<id>` | Routine (per-set goals) |
| `USER#<userId>` | `PLAN#<id>` | Plan (weekly `mon..sun` or monthly `1..31` → routineId) |
| `USER#<userId>` | `SESSION#<id>` | Session with its set logs |
| `USER#<userId>` | `DAY#<date>` | DayLog (notes, AI reviews) |
| `USER#<userId>` | `WEIGHT#<date>` | WeightEntry |
| `USER#<userId>` | `SETTINGS` | Settings; indexed in `gsi1` while reminders are on |
| `USER#<userId>` | `PUSH#<hash>` | Web Push subscription |
| `USER#<userId>` | `AIUSAGE#<date>` | daily AI counter (expires via TTL) |
| `EMAIL#<email>` | `CREDENTIALS` | login record (top-level attributes, not `data`) |

`GET /state` loads the whole user partition. That's fine for one person's training history (hundreds of sessions). If histories get large, add a date-range query on sessions.

## Features

- **Plans & routines**: weekly or monthly plans assign routines (exercises with per-set goals) to days. Plan days can create a routine on the spot.
- **Today**: swipe right to log a set as hit, left to edit reps/weight; rest timer.
- **Log**: a day-by-day journal. Routine executions appear as whole workouts, extra exercises can be logged outside any plan (your library first, then the public catalog), with workout notes, day notes and body weight.
- **AI coach**: on the Log screen, ask for feedback on a day's training. Choose in Settings:
  - **Amazon Bedrock**: runs in the deployment's AWS account. Only models the account can already use are listed; Anthropic models are excluded (also denied by IAM). 30 requests per user per day.
  - **Claude**: each user's own Anthropic API key, stored only in their browser and sent only to Anthropic, via the official `@anthropic-ai/sdk`. Defaults to `claude-opus-5`.
- **Reminders**: Web Push notifications between two times of day, every N hours, optionally only when a scheduled routine still has unlogged sets. On iPhone they require adding the app to the Home Screen (iOS 16.4+).
- **Body weight**: log weigh-ins, set a goal, see the trend on Stats and progress on Home.
- **Library**: browse by equipment, then muscle group, as cards (swipe from demo photos to the muscle map) or as a searchable list.

## Installable app (PWA)

- **Install**: Settings → Install app opens the browser's install dialog (Chrome, Edge, Android) or explains Share → Add to Home Screen on iPhone and iPad. The card hides once the app runs installed.
- **Manifest** (`web/static/manifest.webmanifest`): any and maskable icons, shortcuts for Today, Log and Stats (long-press the app icon), and store screenshots for the richer install dialog.
- **iOS**: Home Screen icon, a dark launch screen per iPhone/iPad size and orientation (instead of a white flash), and a full-screen status bar.
- **Service worker** (`web/src/service-worker.ts`): caches each deploy's files and the Google Fonts so the app shell opens offline, and shows reminders with a monochrome Android badge. Launch screens and screenshots aren't precached.
- **Images**: `npm --prefix web run pwa-assets` regenerates the icons, `favicon.ico`, badge, shortcut icons and launch screens from the SVG marks (and the `<link rel="apple-touch-startup-image">` block in `src/app.html`). Add `-- --screenshots` to recapture the store screenshots from a demo-mode build. It needs a Chromium-based browser (Chrome, Chromium, Edge or Brave; or set `CHROME=/path`).

## Exercise catalog

**Library → Catalog** lets users browse 876 exercises and copy any of them into their own library. Each entry has step-by-step instructions, start/finish photos, primary and secondary muscles, equipment, level and category.

- **Source**: [free-exercise-db](https://github.com/yuhonas/free-exercise-db), public domain (Unlicense), pinned to one commit.
- **Build**: `npm --prefix web run catalog` regenerates `web/static/catalog/exercises.json`, mapping the dataset's muscle and equipment names to the app's ids. Pass a commit SHA to update the pin.
- **Photos**: served from jsDelivr's CDN at the same pinned commit, so they never change underneath the app.
- **Generated visuals**: exercise thumbnails are muscle diagrams drawn from each exercise's muscles, and equipment has its own line icons (`EquipmentIcon.svelte`). Neither needs image files.

## Not implemented yet

- Exercise photo upload. The design shows the button; it's disabled until S3 presigned uploads exist.
- The prototype's "Tweaks" panel (a design-tool control) is not shipped. The dark/light toggle on the dashboard is.
