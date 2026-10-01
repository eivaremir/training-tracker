#!/usr/bin/env bash
# Shared helpers for the deployment scripts. Sourced by scripts/*.sh, not run directly.
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"

# ---- configuration ---------------------------------------------------------
# Values come from the environment, then deploy.env (see deploy.env.example).
if [[ -f "$ROOT_DIR/deploy.env" ]]; then
  set -a
  # shellcheck disable=SC1091
  source "$ROOT_DIR/deploy.env"
  set +a
fi

STACK_NAME="${STACK_NAME:-training-tracker}"
AMPLIFY_BRANCH="${AMPLIFY_BRANCH:-main}"
AWS_REGION="${AWS_REGION:-${AWS_DEFAULT_REGION:-$(aws configure get region 2>/dev/null || true)}}"
export AWS_REGION
[[ -n "${AWS_PROFILE:-}" ]] && export AWS_PROFILE

# shellcheck disable=SC2034 # used by scripts that source this file
TAGS=("Project=$STACK_NAME" "ManagedBy=training-tracker-scripts")

# ---- output ----------------------------------------------------------------
if [[ -t 2 ]]; then
  C_BLUE=$'\033[34m' C_GREEN=$'\033[32m' C_YELLOW=$'\033[33m' C_RED=$'\033[31m' C_BOLD=$'\033[1m' C_RESET=$'\033[0m'
else
  C_BLUE='' C_GREEN='' C_YELLOW='' C_RED='' C_BOLD='' C_RESET=''
fi
log()  { printf '%s==>%s %s\n' "$C_BLUE" "$C_RESET" "$*" >&2; }
ok()   { printf '%s ✓%s  %s\n' "$C_GREEN" "$C_RESET" "$*" >&2; }
warn() { printf '%s !%s  %s\n' "$C_YELLOW" "$C_RESET" "$*" >&2; }
die()  { printf '%s ✗%s  %s\n' "$C_RED" "$C_RESET" "$*" >&2; exit 1; }
bold() { printf '%s%s%s' "$C_BOLD" "$*" "$C_RESET"; }

# ---- checks ----------------------------------------------------------------
require_cmd() { command -v "$1" >/dev/null 2>&1 || die "'$1' is required. $2"; }

# check_prereqs [node] [zip] — AWS CLI v2 and a running Docker are always required.
check_prereqs() {
  require_cmd aws "Install AWS CLI v2: https://docs.aws.amazon.com/cli/latest/userguide/getting-started-install.html"
  [[ "$(aws --version 2>&1)" == aws-cli/2.* ]] || die "AWS CLI v2 is required (found: $(aws --version 2>&1))."
  require_cmd docker "Install Docker: https://docs.docker.com/get-docker/"
  docker info >/dev/null 2>&1 || die "Docker is installed but not running."
  require_cmd curl "Install curl."
  local extra
  for extra in "$@"; do
    case "$extra" in
      node)
        require_cmd node "Install Node.js 20.19+ or 22+: https://nodejs.org"
        require_cmd npm "npm ships with Node.js."
        node -e 'const [a,b]=process.versions.node.split(".").map(Number); process.exit(a>20||(a===20&&b>=19)?0:1)' \
          || die "Node.js 20.19+ is required (found $(node -v))."
        ;;
      zip) require_cmd zip "Install zip (e.g. apt-get install zip)." ;;
    esac
  done
  [[ -n "$AWS_REGION" ]] || die "No AWS region. Set AWS_REGION in deploy.env or run 'aws configure'."
  [[ "$STACK_NAME" =~ ^[a-z][a-z0-9-]{2,30}$ ]] \
    || die "STACK_NAME must be 3-31 chars: lowercase letters, digits and dashes, starting with a letter."
  aws sts get-caller-identity >/dev/null 2>&1 || die "AWS credentials not found or expired. Run 'aws configure' or 'aws sso login'."
}

# ---- AWS helpers -----------------------------------------------------------
account_id() {
  [[ -n "${_ACCOUNT_ID:-}" ]] || _ACCOUNT_ID="$(aws sts get-caller-identity --query Account --output text)"
  echo "$_ACCOUNT_ID"
}

artifact_bucket() { echo "${ARTIFACT_BUCKET:-${STACK_NAME}-artifacts-$(account_id)-${AWS_REGION}}"; }

stack_exists() { aws cloudformation describe-stacks --stack-name "$STACK_NAME" >/dev/null 2>&1; }

stack_output() {
  aws cloudformation describe-stacks --stack-name "$STACK_NAME" \
    --query "Stacks[0].Outputs[?OutputKey=='$1'].OutputValue" --output text
}

# Exports the caller's current credentials (works for SSO, roles and access keys)
# so they can be handed to a Docker container with `-e AWS_ACCESS_KEY_ID ...`.
export_aws_credentials() {
  eval "$(aws configure export-credentials --format env)"
}

# Idempotently creates `api create-user`'s image (native arch, used for admin commands).
build_admin_image() {
  log "Building admin image (first run takes a couple of minutes)"
  docker build -q -t training-tracker-api:admin "$ROOT_DIR/api" >/dev/null
}

vapid_secret_name() { echo "${STACK_NAME}/vapid-private-key"; }

# Ensures the Web Push (VAPID) private key exists in Secrets Manager; prints its ARN.
# The key is generated locally by the admin image and passed through a private temp file,
# never on a command line.
ensure_vapid_secret() {
  local name arn deleted tmp
  name="$(vapid_secret_name)"
  if arn="$(aws secretsmanager describe-secret --secret-id "$name" --query ARN --output text 2>/dev/null)"; then
    deleted="$(aws secretsmanager describe-secret --secret-id "$name" --query DeletedDate --output text)"
    if [[ "$deleted" != "None" ]]; then
      log "Restoring push key scheduled for deletion"
      aws secretsmanager restore-secret --secret-id "$name" >/dev/null
    fi
    echo "$arn"
    return
  fi
  build_admin_image
  log "Generating Web Push (VAPID) key"
  tmp="$(umask 077; mktemp)"
  docker run --rm training-tracker-api:admin api vapid-keygen | tr -d '\n' > "$tmp"
  arn="$(aws secretsmanager create-secret --name "$name" --description "Training Tracker Web Push private key" \
    --secret-string "file://$tmp" --tags "Key=Project,Value=$STACK_NAME" "Key=ManagedBy,Value=training-tracker-scripts" \
    --query ARN --output text)"
  rm -f "$tmp"
  echo "$arn"
}

# ---- Amplify ---------------------------------------------------------------
amplify_app_id() {
  local id
  id="$(aws amplify list-apps --query "apps[?name=='$STACK_NAME'].appId | [0]" --output text)"
  [[ "$id" != "None" ]] && echo "$id" || true
}

amplify_origin() {
  local domain
  domain="$(aws amplify get-app --app-id "$1" --query app.defaultDomain --output text)"
  echo "https://${AMPLIFY_BRANCH}.${domain}"
}

# Creates the Amplify app + branch for direct (zip) deployments if missing; prints the app id.
ensure_amplify_app() {
  local id
  id="$(amplify_app_id)"
  if [[ -z "$id" ]]; then
    log "Creating Amplify app '$STACK_NAME'"
    id="$(aws amplify create-app --name "$STACK_NAME" --platform WEB \
      --description "Training Tracker web app" \
      --custom-rules "file://$ROOT_DIR/infra/amplify-rules.json" \
      --custom-headers "file://$ROOT_DIR/infra/amplify-headers.yml" \
      --tags "Project=$STACK_NAME,ManagedBy=training-tracker-scripts" \
      --query app.appId --output text)"
    ok "Amplify app $id"
  else
    # Keep rewrite rules and headers in sync with the repo.
    aws amplify update-app --app-id "$id" \
      --custom-rules "file://$ROOT_DIR/infra/amplify-rules.json" \
      --custom-headers "file://$ROOT_DIR/infra/amplify-headers.yml" >/dev/null
  fi
  if ! aws amplify get-branch --app-id "$id" --branch-name "$AMPLIFY_BRANCH" >/dev/null 2>&1; then
    log "Creating Amplify branch '$AMPLIFY_BRANCH'"
    aws amplify create-branch --app-id "$id" --branch-name "$AMPLIFY_BRANCH" --stage PRODUCTION >/dev/null
  fi
  echo "$id"
}

# ---- prompts ---------------------------------------------------------------
# confirm "question" — returns 0 on yes. Non-interactive shells need --yes (ASSUME_YES=1).
confirm() {
  [[ "${ASSUME_YES:-0}" == 1 ]] && return 0
  [[ -t 0 ]] || die "Refusing to continue without a terminal. Re-run with --yes."
  local reply
  read -r -p "$1 [y/N] " reply
  [[ "$reply" =~ ^[Yy]$ ]]
}
