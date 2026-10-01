#!/usr/bin/env bash
# Tears the deployment down. User data (the DynamoDB table) is kept unless --delete-data is given.
# shellcheck source=lib/common.sh
source "$(dirname "$0")/lib/common.sh"

usage() {
  cat <<USAGE
Usage: scripts/destroy.sh [--delete-data] [--delete-artifacts] [--yes]

Deletes the Amplify app and the CloudFormation stack (Lambda, HTTP API,
signing secret, logs).

  --delete-data        Also delete the DynamoDB table. All users and training data are lost.
  --delete-artifacts   Also empty and delete the S3 artifact bucket.
  --yes                Skip the typed confirmation (for CI).
USAGE
}

DELETE_DATA=0 DELETE_ARTIFACTS=0
while [[ $# -gt 0 ]]; do
  case "$1" in
    --delete-data) DELETE_DATA=1 ;;
    --delete-artifacts) DELETE_ARTIFACTS=1 ;;
    --yes) export ASSUME_YES=1 ;;
    -h|--help) usage; exit 0 ;;
    *) usage; die "Unknown option: $1" ;;
  esac
  shift
done

check_prereqs
APP_ID="$(amplify_app_id)"
TABLE=''
stack_exists && TABLE="$(stack_output TableName)"
BUCKET="$(artifact_bucket)"

echo "This will delete from account $(account_id), region $AWS_REGION:"
[[ -n "$APP_ID" ]] && echo "  - Amplify app $STACK_NAME ($APP_ID) and its website"
[[ -n "$TABLE" ]] && echo "  - CloudFormation stack $STACK_NAME (API, Lambdas, signing secret, reminder schedule, logs)"
VAPID_NAME="$(vapid_secret_name)"
HAS_VAPID=0
aws secretsmanager describe-secret --secret-id "$VAPID_NAME" --query DeletedDate --output text 2>/dev/null | grep -q None && HAS_VAPID=1
[[ "$HAS_VAPID" == 1 ]] && echo "  - Web Push key $VAPID_NAME (7-day recovery window; devices must re-enable reminders)"
if [[ "$DELETE_DATA" == 1 && -n "$TABLE" ]]; then
  echo "  - $(bold "DynamoDB table $TABLE — ALL USERS AND TRAINING DATA")"
elif [[ -n "$TABLE" ]]; then
  echo "  (DynamoDB table $TABLE is kept; delete it later with --delete-data or the AWS console)"
fi
[[ "$DELETE_ARTIFACTS" == 1 ]] && echo "  - S3 bucket $BUCKET"
[[ -z "$APP_ID" && -z "$TABLE" && "$HAS_VAPID" == 0 && "$DELETE_ARTIFACTS" == 0 ]] && { ok "Nothing to delete."; exit 0; }

if [[ "${ASSUME_YES:-0}" != 1 ]]; then
  [[ -t 0 ]] || die "Refusing to continue without a terminal. Re-run with --yes."
  read -r -p "Type the stack name ($STACK_NAME) to confirm: " TYPED
  [[ "$TYPED" == "$STACK_NAME" ]] || die "Aborted."
fi

if [[ -n "$APP_ID" ]]; then
  log "Deleting Amplify app"
  aws amplify delete-app --app-id "$APP_ID" >/dev/null
  ok "Amplify app deleted"
fi

if [[ -n "$TABLE" ]]; then
  log "Deleting stack $STACK_NAME (a few minutes)"
  aws cloudformation delete-stack --stack-name "$STACK_NAME"
  aws cloudformation wait stack-delete-complete --stack-name "$STACK_NAME"
  ok "Stack deleted"
  if [[ "$DELETE_DATA" == 1 ]]; then
    log "Deleting table $TABLE"
    aws dynamodb delete-table --table-name "$TABLE" >/dev/null
    aws dynamodb wait table-not-exists --table-name "$TABLE"
    ok "Table deleted"
  fi
fi

if [[ "$HAS_VAPID" == 1 ]]; then
  aws secretsmanager delete-secret --secret-id "$VAPID_NAME" --recovery-window-in-days 7 >/dev/null
  ok "Push key scheduled for deletion"
fi

if [[ "$DELETE_ARTIFACTS" == 1 ]] && aws s3api head-bucket --bucket "$BUCKET" 2>/dev/null; then
  log "Deleting bucket $BUCKET"
  aws s3 rm "s3://$BUCKET" --recursive --only-show-errors
  aws s3api delete-bucket --bucket "$BUCKET"
  ok "Bucket deleted"
fi
