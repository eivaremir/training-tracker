#!/usr/bin/env bash
# Creates a login in the deployed stack. There is no public sign-up; this is how accounts are added.
# shellcheck source=lib/common.sh
source "$(dirname "$0")/lib/common.sh"

usage() {
  cat <<USAGE
Usage: scripts/create-user.sh --email you@example.com

Prompts for the password (hidden). For automation, set TT_USER_PASSWORD instead.
Existing users are left unchanged.
USAGE
}

EMAIL=''
while [[ $# -gt 0 ]]; do
  case "$1" in
    --email) EMAIL="${2:-}"; shift ;;
    -h|--help) usage; exit 0 ;;
    *) usage; die "Unknown option: $1" ;;
  esac
  shift
done
[[ -n "$EMAIL" ]] || { usage; die "--email is required."; }

check_prereqs
stack_exists || die "Stack '$STACK_NAME' not found. Run scripts/deploy-api.sh first."

PASSWORD="${TT_USER_PASSWORD:-}"
if [[ -z "$PASSWORD" ]]; then
  [[ -t 0 ]] || die "No terminal to prompt for a password; set TT_USER_PASSWORD."
  read -r -s -p "Password for $EMAIL (8-128 chars): " PASSWORD; echo >&2
  read -r -s -p "Repeat password: " PASSWORD2; echo >&2
  [[ "$PASSWORD" == "$PASSWORD2" ]] || die "Passwords don't match."
fi
(( ${#PASSWORD} >= 8 && ${#PASSWORD} <= 128 )) || die "Password must be 8-128 characters."

build_admin_image
export_aws_credentials
# Values are inherited from the environment so the password never appears on a command line.
export TABLE_NAME CREATE_USER_EMAIL CREATE_USER_PASSWORD
TABLE_NAME="$(stack_output TableName)"
CREATE_USER_EMAIL="$EMAIL"
CREATE_USER_PASSWORD="$PASSWORD"
docker run --rm \
  -e AWS_ACCESS_KEY_ID -e AWS_SECRET_ACCESS_KEY -e AWS_SESSION_TOKEN -e AWS_REGION \
  -e TABLE_NAME -e CREATE_USER_EMAIL -e CREATE_USER_PASSWORD \
  training-tracker-api:admin api create-user
