#!/usr/bin/env bash
# Builds the SvelteKit app against the deployed API and publishes it to Amplify Hosting
# with a direct (zip) deployment — no Git connection or GitHub token needed.
# shellcheck source=lib/common.sh
source "$(dirname "$0")/lib/common.sh"

usage() {
  cat <<USAGE
Usage: scripts/deploy-web.sh

Requires the API stack (scripts/deploy-api.sh). Creates the Amplify app and
branch '\$AMPLIFY_BRANCH' on first run.
USAGE
}
[[ "${1:-}" =~ ^(-h|--help)$ ]] && { usage; exit 0; }

check_prereqs node zip
stack_exists || die "Stack '$STACK_NAME' not found. Run scripts/deploy-api.sh first."
API_URL="$(stack_output ApiUrl)"
APP_ID="$(ensure_amplify_app)"

log "Building web app (VITE_API_URL=$API_URL)"
(
  cd "$ROOT_DIR/web" || exit 1
  npm ci --no-audit --no-fund --loglevel=error
  VITE_API_URL="$API_URL" npm run build --silent
)

ZIP="$(mktemp -d)/web.zip"
trap 'rm -rf "$(dirname "$ZIP")"' EXIT
(cd "$ROOT_DIR/web/build" && zip -qr "$ZIP" .)

log "Uploading to Amplify ($APP_ID / $AMPLIFY_BRANCH)"
read -r JOB_ID UPLOAD_URL < <(aws amplify create-deployment --app-id "$APP_ID" --branch-name "$AMPLIFY_BRANCH" \
  --query '[jobId, zipUploadUrl]' --output text)
[[ -n "${UPLOAD_URL:-}" ]] || die "Amplify did not return an upload URL."
curl -fsS -X PUT -H 'Content-Type: application/zip' --upload-file "$ZIP" "$UPLOAD_URL"
aws amplify start-deployment --app-id "$APP_ID" --branch-name "$AMPLIFY_BRANCH" --job-id "$JOB_ID" >/dev/null

STATUS=PENDING
for _ in $(seq 1 90); do
  STATUS="$(aws amplify get-job --app-id "$APP_ID" --branch-name "$AMPLIFY_BRANCH" --job-id "$JOB_ID" \
    --query job.summary.status --output text)"
  case "$STATUS" in SUCCEED|FAILED|CANCELLED) break ;; esac
  sleep 4
done
[[ "$STATUS" == SUCCEED ]] || die "Amplify deployment $JOB_ID ended with status $STATUS. See the Amplify console."

ORIGIN="$(amplify_origin "$APP_ID")"
ok "Web app live: $ORIGIN"

CURRENT_CORS="$(aws cloudformation describe-stacks --stack-name "$STACK_NAME" \
  --query "Stacks[0].Parameters[?ParameterKey=='CorsOrigins'].ParameterValue" --output text)"
if [[ -z "${CORS_ORIGINS:-}" && "$CURRENT_CORS" != "$ORIGIN" ]]; then
  warn "API still allows CORS from '$CURRENT_CORS'. Run scripts/deploy-api.sh --skip-build to restrict it to $ORIGIN."
fi
