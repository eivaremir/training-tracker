#!/usr/bin/env bash
# Tails the API's Lambda logs.
# shellcheck source=lib/common.sh
source "$(dirname "$0")/lib/common.sh"
[[ "${1:-}" =~ ^(-h|--help)$ ]] && { echo "Usage: scripts/logs.sh [--since 1h]   (extra args go to 'aws logs tail')"; exit 0; }

check_prereqs
stack_exists || die "Stack '$STACK_NAME' not found."
FN="$(stack_output ApiFunctionName)"
[[ $# -gt 0 ]] || set -- --since 30m
aws logs tail "/aws/lambda/$FN" --follow --format short "$@"
