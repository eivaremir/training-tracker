#!/usr/bin/env bash
# Builds the Rust Lambda (in Docker) and deploys the CloudFormation stack:
# DynamoDB (on-demand) + Lambda with a public function URL + Secrets Manager signing key.
# shellcheck source=lib/common.sh
source "$(dirname "$0")/lib/common.sh"

usage() {
  cat <<USAGE
Usage: scripts/deploy-api.sh [--skip-build]

  --skip-build   Reuse api/target/lambda from a previous build.

CORS: uses \$CORS_ORIGINS if set, otherwise the Amplify app's URL if the app
exists, otherwise '*'.
USAGE
}

SKIP_BUILD=0
while [[ $# -gt 0 ]]; do
  case "$1" in
    --skip-build) SKIP_BUILD=1 ;;
    -h|--help) usage; exit 0 ;;
    *) usage; die "Unknown option: $1" ;;
  esac
  shift
done

check_prereqs
BUCKET="$(artifact_bucket)"
aws s3api head-bucket --bucket "$BUCKET" >/dev/null 2>&1 || die "Artifact bucket s3://$BUCKET not found. Run scripts/bootstrap.sh first."

APP_ID="$(amplify_app_id)"
if [[ -z "${CORS_ORIGINS:-}" ]]; then
  if [[ -n "$APP_ID" ]]; then
    CORS_ORIGINS="$(amplify_origin "$APP_ID")"
  else
    CORS_ORIGINS='*'
    warn "No Amplify app yet: allowing CORS from any origin. Re-run after deploy-web.sh to lock it down."
  fi
fi

if [[ "$SKIP_BUILD" == 0 ]]; then
  log "Building Lambda binary (arm64) with cargo-lambda"
  docker run --rm -v "$ROOT_DIR/api":/code -w /code ghcr.io/cargo-lambda/cargo-lambda:latest \
    cargo lambda build --release --arm64
fi
[[ -f "$ROOT_DIR/api/target/lambda/training-tracker-api/bootstrap" ]] || die "Lambda binary missing; run without --skip-build."

VAPID_ARN="$(ensure_vapid_secret)"
# Push services need a contact: CONTACT_EMAIL if set, otherwise the site's own URL.
if [[ -n "${CONTACT_EMAIL:-}" ]]; then
  VAPID_SUBJECT="mailto:$CONTACT_EMAIL"
elif [[ -n "${APP_ID:-}" ]]; then
  VAPID_SUBJECT="$(amplify_origin "$APP_ID")"
else
  VAPID_SUBJECT="mailto:admin@example.com"
fi

log "Packaging template"
aws cloudformation package \
  --template-file "$ROOT_DIR/infra/template.yaml" \
  --s3-bucket "$BUCKET" --s3-prefix "$STACK_NAME" \
  --output-template-file "$ROOT_DIR/infra/packaged.yaml" >/dev/null

OLD_API_URL="$(stack_exists && stack_output ApiUrl || true)"
log "Deploying stack $(bold "$STACK_NAME") to $AWS_REGION (CORS: $CORS_ORIGINS)"
aws cloudformation deploy \
  --template-file "$ROOT_DIR/infra/packaged.yaml" --stack-name "$STACK_NAME" \
  --capabilities CAPABILITY_IAM CAPABILITY_AUTO_EXPAND \
  --parameter-overrides "CorsOrigins=$CORS_ORIGINS" "VapidSecretArn=$VAPID_ARN" "VapidSubject=$VAPID_SUBJECT" \
  --tags "${TAGS[@]}" \
  --no-fail-on-empty-changeset

API_URL="$(stack_output ApiUrl)"
if [[ -n "$OLD_API_URL" && "$OLD_API_URL" != "$API_URL" ]]; then
  warn "The API URL changed ($OLD_API_URL -> $API_URL). Run ./scripts/deploy-web.sh so the web app uses it."
fi
if curl -fsS --max-time 20 "$API_URL/health" >/dev/null; then
  ok "API healthy: $API_URL"
else
  warn "API deployed but /health did not answer yet: $API_URL"
fi
