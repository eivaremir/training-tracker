#!/usr/bin/env bash
# One command from zero to a running app: bucket → Amplify app → API → web → first user.
# Safe to re-run; each step is idempotent, so this is also how you ship updates.
# shellcheck source=lib/common.sh
source "$(dirname "$0")/lib/common.sh"

usage() {
  cat <<USAGE
Usage: scripts/up.sh [--admin-email you@example.com] [--yes]

  --admin-email   Create this login at the end (prompts for its password).
  --yes           Don't prompt.
USAGE
}

ADMIN_EMAIL=''
while [[ $# -gt 0 ]]; do
  case "$1" in
    --admin-email) ADMIN_EMAIL="${2:-}"; shift ;;
    --yes) export ASSUME_YES=1 ;;
    -h|--help) usage; exit 0 ;;
    *) usage; die "Unknown option: $1" ;;
  esac
  shift
done

check_prereqs node zip
echo "Deploying $(bold "$STACK_NAME") to account $(account_id), region $(bold "$AWS_REGION")."
echo "Creates: S3 artifact bucket, DynamoDB table, Lambda, HTTP API (public URL), Secrets Manager secret, Amplify app (public URL)."
confirm "Continue?" || die "Aborted."

DIR="$(dirname "$0")"
"$DIR/bootstrap.sh"
APP_ID="$(ensure_amplify_app)"
export CORS_ORIGINS="${CORS_ORIGINS:-$(amplify_origin "$APP_ID")}"
"$DIR/deploy-api.sh"
"$DIR/deploy-web.sh"

if [[ -n "$ADMIN_EMAIL" ]]; then
  "$DIR/create-user.sh" --email "$ADMIN_EMAIL"
fi

echo
ok "Done."
echo "  Web: $(bold "$(amplify_origin "$APP_ID")")"
echo "  API: $(stack_output ApiUrl)"
[[ -n "$ADMIN_EMAIL" ]] || echo "  Create a login: scripts/create-user.sh --email you@example.com"
