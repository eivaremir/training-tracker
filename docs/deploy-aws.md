# Deploying Training Tracker on AWS

This guide takes you from a fresh clone to a running, login-protected instance on your own AWS account, using the scripts in `scripts/`. Budget about 15 minutes, most of it waiting on the first build.

## What gets deployed

```
                 ┌──────────────────────────┐
  Browser ──────▶│ Amplify Hosting (public) │  static SvelteKit app
     │           └──────────────────────────┘
     │  HTTPS + Bearer token
     ▼
┌──────────────────────────┐    ┌──────────────────────┐    ┌───────────────────────────┐
│ Lambda function URL      │───▶│ Lambda (Rust, arm64) │───▶│ DynamoDB (on-demand)      │
│ (public HTTPS endpoint)  │    │ max 10 in parallel   │    │ users + training data     │
└──────────────────────────┘    └──────────┬───────────┘    └───────────────────────────┘
                                           │ reads at cold start
                                           ▼
                                ┌──────────────────────┐    ┌───────────────────────────┐
                                │ Secrets Manager      │    │ Amazon Bedrock            │
                                │ signing + push keys  │    │ AI coach (Converse)       │
                                └──────────────────────┘    └───────────────────────────┘

EventBridge Scheduler (every 15 min) ──▶ Reminders Lambda ──▶ browser push services ──▶ devices
```

| Resource | Created by | Reachable from the internet? |
|---|---|---|
| Amplify app + branch | `deploy-web.sh` | Yes: the website (static files only) |
| Lambda function + IAM role + function URL | `deploy-api.sh` (CloudFormation) | Yes, through its function URL, but only `/health` and `/auth/login` work without a login token. At most 10 requests run at once (reserved concurrency) |
| DynamoDB table (`PAY_PER_REQUEST`, point-in-time recovery) | `deploy-api.sh` | No |
| Secrets Manager secrets (token-signing key, Web Push key) | `deploy-api.sh` | No |
| Reminders Lambda + EventBridge schedule (every 15 min) | `deploy-api.sh` | No |
| CloudWatch log group (30-day retention) | `deploy-api.sh` | No |
| S3 artifact bucket (private, encrypted, TLS-only) | `bootstrap.sh` | No |

Everything is tagged `Project=<stack name>` and `ManagedBy=training-tracker-scripts`.

## Cost

There's no always-on server. The fixed monthly charge is the two Secrets Manager secrets (about $0.40/month each). The reminders Lambda runs about 2,900 times a month, typically within the Lambda free tier. **The Bedrock AI coach is billed per token to the deploying account**; each user is limited to 30 requests a day, and small models such as Amazon Nova Micro/Lite cost fractions of a cent per review. The Claude option is billed to each user's own Anthropic account. Lambda (function URLs cost nothing extra), DynamoDB on-demand and Amplify Hosting are billed per request, per GB stored or per GB served. For a personal instance that usually lands within the AWS Free Tier or at a few dollars a month. Check current prices before you deploy: [Lambda](https://aws.amazon.com/lambda/pricing/), [DynamoDB](https://aws.amazon.com/dynamodb/pricing/on-demand/), [Amplify](https://aws.amazon.com/amplify/pricing/), [Secrets Manager](https://aws.amazon.com/secrets-manager/pricing/).

## Prerequisites

| Tool | Version | Why |
|---|---|---|
| [AWS CLI](https://docs.aws.amazon.com/cli/latest/userguide/getting-started-install.html) | v2 | All AWS calls |
| [Docker](https://docs.docker.com/get-docker/) | any recent | Compiles the Rust Lambda and runs admin commands. No local Rust needed |
| [Node.js](https://nodejs.org) | 20.19+ or 22+ | Builds the web app |
| `zip`, `curl`, `bash` | | Packaging and upload |

**AWS permissions.** The identity you deploy with needs to manage: CloudFormation, IAM roles (the stack creates the Lambdas' roles), Lambda (including function URLs), DynamoDB, Secrets Manager, EventBridge Scheduler, CloudWatch Logs, S3 and Amplify.

**Bedrock models.** The AI coach lists only the models your account can already invoke in the deployment region. Anthropic models are never offered through Bedrock (users bring their own Anthropic key instead). If the list is empty, enable models in the Bedrock console for your region. An administrator role in a dedicated account (or AWS Organizations sandbox account) is the simplest setup.

Sign in with the CLI in whichever way your account uses:

```bash
aws configure
```

or, with IAM Identity Center:

```bash
aws sso login --profile my-profile
```

## Quick start

**1. Configure.** Copy the example and set at least your region (and `AWS_PROFILE` if you use one). Optionally set `CONTACT_EMAIL`, the contact browser push services see for reminders; it defaults to your site's URL.

```bash
cp deploy.env.example deploy.env
```

`deploy.env` is git-ignored. Every setting can also be passed as an environment variable.

**2. Deploy everything and create your login:**

```bash
./scripts/up.sh --admin-email you@example.com
```

It lists what it's about to create, asks for confirmation, and at the end prompts (hidden input) for your password. When it finishes it prints:

```
 ✓  Done.
  Web: https://main.d1abc2def3.amplifyapp.com
  API: https://abc123def456.lambda-url.us-east-1.on.aws
```

**3. Open the web URL and sign in.** New accounts start empty. **Stats → Load demo data** fills in four weeks of example history.

### What `up.sh` does

1. `bootstrap.sh` creates the artifact bucket, or re-applies its hardening if it already exists.
2. Creates the Amplify app first, so the API can restrict CORS to its URL from the start.
3. `deploy-api.sh` compiles the Lambda in the `cargo-lambda` Docker image, then packages and deploys `infra/template.yaml`, and checks `/health`.
4. `deploy-web.sh` builds the web app with the API URL baked in, uploads it to Amplify, and waits for the deployment to finish.
5. `create-user.sh` creates your login, if you passed `--admin-email`.

Each step is safe to re-run.

## Day-to-day operations

### Ship an update

Re-run the full pipeline:

```bash
./scripts/up.sh
```

Or only the part that changed. For API changes (Rust code or `infra/template.yaml`):

```bash
./scripts/deploy-api.sh
```

For web changes:

```bash
./scripts/deploy-web.sh
```

CloudFormation only replaces what changed. Your data is untouched. If `deploy-api.sh` reports that the API URL changed (for example when moving an older deployment from API Gateway to the function URL), run `deploy-web.sh` too so the web app points at the new URL.

### Add users

There's no public sign-up. Accounts are created by whoever operates the deployment:

```bash
./scripts/create-user.sh --email friend@example.com
```

For automation, set `TT_USER_PASSWORD` instead of typing it. The password is passed to the container through the environment, never on a command line. Running the command for an email that already exists changes nothing.

### Check health and logs

```bash
./scripts/status.sh
```

```bash
./scripts/logs.sh
```

`logs.sh` follows the Lambda's logs. Pass `--since 2h` or any other `aws logs tail` flag.

### Multiple environments

Each `STACK_NAME` is a fully separate deployment (its own table, API, secret, Amplify app and bucket):

```bash
STACK_NAME=training-tracker-staging ./scripts/up.sh
```

### Custom domain

1. Add the domain to the Amplify app in the console (**Hosting → Custom domains**), or with `aws amplify create-domain-association`. Amplify issues the TLS certificate.
2. Allow the new origin on the API. Keep the Amplify URL in the list if you still use it:

```bash
CORS_ORIGINS=https://train.example.com,https://main.d1abc2def3.amplifyapp.com ./scripts/deploy-api.sh --skip-build
```

Add `CORS_ORIGINS` to `deploy.env` so later deploys keep it.

### Git-connected builds (optional)

The scripts upload builds directly, so forks don't need to connect GitHub to Amplify. If you'd rather have Amplify build on every push, connect the repo in the Amplify console instead. `amplify.yml` at the repo root is already set up for that. Set the app's environment variables `AMPLIFY_MONOREPO_APP_ROOT=web` and `VITE_API_URL=<API URL>`. The rewrite rule and headers live in `infra/amplify-rules.json` and `infra/amplify-headers.yml`.

### Reminders

Users turn reminders on in **Settings**: the browser asks for notification permission, and the device is registered with the API. The scheduler checks every 15 minutes, in each user's own time zone. On iPhone and iPad, Web Push only works for the app installed on the Home Screen (Share → Add to Home Screen, iOS 16.4+); Settings explains this when needed.

## Tear down

```bash
./scripts/destroy.sh
```

This deletes the Amplify app, the CloudFormation stack (API, Lambdas, signing secret, reminder schedule, logs) and schedules the Web Push key for deletion (7-day recovery). You must type the stack name to confirm.

**Your DynamoDB table is kept by default**, so an accidental teardown never loses users or training history. To delete everything, including all data and the artifact bucket:

```bash
./scripts/destroy.sh --delete-data --delete-artifacts
```

A kept table is not reattached if you deploy again later. A new, empty table is created and the old one stays in your account until you delete it.

## Security notes

- **Authentication** is email + password handled by the API. Passwords are hashed with Argon2id, and sessions are 7-day signed tokens. Five wrong passwords lock an account for 15 minutes. See the Auth section of the README.
- **AI**: Bedrock is limited to models the account is authorized for, never Anthropic (enforced in code and by an IAM deny), with per-user daily limits and capped prompt/response sizes. Anthropic API keys stay in each user's browser. Answers are rendered as plain text.
- **Push**: subscriptions are only accepted for browser push-service hosts, so the server can't be pointed at internal addresses.
- **Signing key**: Secrets Manager generates it and only the Lambda's role can read it. It never touches your machine or the repo. Rotating it (`aws secretsmanager put-secret-value` with a new 64-character value) signs everyone out.
- **Least privilege**: the Lambda can only read and write its own table and read its own secret.
- **CORS** is limited to your Amplify URL (plus any `CORS_ORIGINS` you add).
- **Browser headers**: the site sends HSTS, `X-Frame-Options: DENY`, `nosniff` and a strict referrer policy.
- **Weak test accounts**: `test@mailinator.com` / `123456789` exists only in the local Docker setup. Don't create it on a public deployment; Mailinator inboxes are public and the password is easy to guess.
- **Rate limits**: the API runs at most 10 requests at once (reserved concurrency); extra requests get `429`. Failed logins and AI requests also have per-account limits.
- **Stronger protection** (optional): put CloudFront with AWS WAF in front of the function URL for per-IP rate limits, and turn on DynamoDB deletion protection for the table.

## Troubleshooting

| Symptom | Fix |
|---|---|
| `AWS credentials not found or expired` | `aws sso login` (or `aws configure`), and check `AWS_PROFILE` |
| `Docker is installed but not running` | Start Docker Desktop |
| `Artifact bucket ... not found` | Run `./scripts/bootstrap.sh` (or just `./scripts/up.sh`) |
| Stack stuck in `ROLLBACK_COMPLETE` | A first deploy failed. Read the error in the CloudFormation console, delete the stack with `./scripts/destroy.sh`, then deploy again |
| Browser shows CORS errors | The page's origin isn't in `CORS_ORIGINS`; see [Custom domain](#custom-domain) |
| Login says "Can't reach the server" | Check `./scripts/status.sh`; the web build may point at an old API URL, so re-run `./scripts/deploy-web.sh` |
| `429 too many failed attempts` | The account is locked for 15 minutes after 5 failures. Wait it out |
| Deep link like `/today` returns 404 | The rewrite rule is missing; re-run `./scripts/deploy-web.sh` to re-apply it |

## Script reference

| Script | What it does |
|---|---|
| `scripts/up.sh [--admin-email E] [--yes]` | Everything below, in order |
| `scripts/bootstrap.sh` | Create or harden the S3 artifact bucket |
| `scripts/deploy-api.sh [--skip-build]` | Build the Lambda and deploy the CloudFormation stack |
| `scripts/deploy-web.sh` | Build the web app and publish it to Amplify |
| `scripts/create-user.sh --email E` | Create a login |
| `scripts/status.sh` | Show what's deployed and whether it's healthy |
| `scripts/logs.sh [aws logs tail flags]` | Follow the API logs |
| `scripts/destroy.sh [--delete-data] [--delete-artifacts] [--yes]` | Tear down |

Every script accepts `--help` and reads its settings from `deploy.env` or the environment.
