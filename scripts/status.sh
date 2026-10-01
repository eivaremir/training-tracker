#!/usr/bin/env bash
# Shows what is deployed and whether it is healthy.
# shellcheck source=lib/common.sh
source "$(dirname "$0")/lib/common.sh"
[[ "${1:-}" =~ ^(-h|--help)$ ]] && { echo "Usage: scripts/status.sh"; exit 0; }

check_prereqs
echo "$(bold Stack)       $STACK_NAME ($AWS_REGION, account $(account_id))"

if stack_exists; then
  STATUS="$(aws cloudformation describe-stacks --stack-name "$STACK_NAME" --query 'Stacks[0].StackStatus' --output text)"
  API_URL="$(stack_output ApiUrl)"
  echo "$(bold API)         $STATUS · $API_URL"
  echo "$(bold Table)       $(stack_output TableName)"
  if curl -fsS --max-time 10 "$API_URL/health" >/dev/null; then ok "API /health OK"; else warn "API /health not responding"; fi
else
  echo "$(bold API)         not deployed"
fi

APP_ID="$(amplify_app_id)"
if [[ -n "$APP_ID" ]]; then
  ORIGIN="$(amplify_origin "$APP_ID")"
  LAST="$(aws amplify list-jobs --app-id "$APP_ID" --branch-name "$AMPLIFY_BRANCH" --max-results 1 --no-paginate \
    --query 'jobSummaries[0].[status, endTime]' --output text 2>/dev/null || echo 'no deployments')"
  echo "$(bold Web)         $ORIGIN · last deploy: $LAST"
else
  echo "$(bold Web)         not deployed"
fi

BUCKET="$(artifact_bucket)"
if aws s3api head-bucket --bucket "$BUCKET" >/dev/null 2>&1; then echo "$(bold Artifacts)   s3://$BUCKET"; else echo "$(bold Artifacts)   not created"; fi
