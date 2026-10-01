#!/usr/bin/env bash
# Creates the private S3 bucket that holds Lambda build artifacts. Safe to re-run.
# shellcheck source=lib/common.sh
source "$(dirname "$0")/lib/common.sh"

usage() {
  cat <<USAGE
Usage: scripts/bootstrap.sh

Creates (or re-hardens) the artifact bucket used by CloudFormation packaging:
private, encrypted, TLS-only, objects expire after 30 days.
Bucket name: \$ARTIFACT_BUCKET or <stack>-artifacts-<account>-<region>.
USAGE
}
[[ "${1:-}" =~ ^(-h|--help)$ ]] && { usage; exit 0; }

check_prereqs
BUCKET="$(artifact_bucket)"

if aws s3api head-bucket --bucket "$BUCKET" 2>/dev/null; then
  ok "Bucket s3://$BUCKET exists"
else
  log "Creating s3://$BUCKET in $AWS_REGION"
  if [[ "$AWS_REGION" == us-east-1 ]]; then
    aws s3api create-bucket --bucket "$BUCKET" >/dev/null
  else
    aws s3api create-bucket --bucket "$BUCKET" --create-bucket-configuration "LocationConstraint=$AWS_REGION" >/dev/null
  fi
fi

aws s3api put-public-access-block --bucket "$BUCKET" --public-access-block-configuration \
  BlockPublicAcls=true,IgnorePublicAcls=true,BlockPublicPolicy=true,RestrictPublicBuckets=true
aws s3api put-bucket-encryption --bucket "$BUCKET" --server-side-encryption-configuration \
  '{"Rules":[{"ApplyServerSideEncryptionByDefault":{"SSEAlgorithm":"AES256"}}]}'
aws s3api put-bucket-policy --bucket "$BUCKET" --policy "$(cat <<POLICY
{"Version":"2012-10-17","Statement":[{"Sid":"DenyInsecureTransport","Effect":"Deny","Principal":"*","Action":"s3:*",
"Resource":["arn:aws:s3:::$BUCKET","arn:aws:s3:::$BUCKET/*"],"Condition":{"Bool":{"aws:SecureTransport":"false"}}}]}
POLICY
)"
aws s3api put-bucket-lifecycle-configuration --bucket "$BUCKET" --lifecycle-configuration \
  '{"Rules":[{"ID":"expire-build-artifacts","Status":"Enabled","Filter":{"Prefix":""},"Expiration":{"Days":30},"AbortIncompleteMultipartUpload":{"DaysAfterInitiation":1}}]}'
aws s3api put-bucket-tagging --bucket "$BUCKET" --tagging \
  "TagSet=[{Key=Project,Value=$STACK_NAME},{Key=ManagedBy,Value=training-tracker-scripts}]"
ok "Bucket is private, encrypted and TLS-only"
