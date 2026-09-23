#!/usr/bin/env bash
# Build with a canary GitLab token and fail if it, or the token header name,
# ends up in the client bundle. The browser must never hold the GitLab token.
set -euo pipefail

CANARY="canary-$(openssl rand -hex 8 2>/dev/null || date +%s)"
STATIC_DIR=".next/static"

if [[ "${SKIP_BUILD:-0}" != "1" ]]; then
  rm -rf .next
  GITLAB_TOKEN="$CANARY" NEXT_PUBLIC_GITLAB_TOKEN="$CANARY" npm run build >/dev/null
fi

if [[ ! -d "$STATIC_DIR" ]]; then
  echo "error: $STATIC_DIR not found; run the build first" >&2
  exit 2
fi

if matches=$(grep -rlE "PRIVATE-TOKEN|${CANARY}" "$STATIC_DIR"); then
  echo "error: GitLab token material found in the client bundle:" >&2
  echo "$matches" >&2
  exit 1
fi

echo "client bundle clean: no GitLab token or PRIVATE-TOKEN header in $STATIC_DIR"
