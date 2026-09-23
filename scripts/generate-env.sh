#!/usr/bin/env bash
# =============================================================================
# GitLab CI/CD Dashboard - .env generator
#
# Writes a .env file with strong random secrets for docker-compose.yml.
# Never overwrites an existing file: if the target exists it is left untouched
# and the script exits 0, so it is safe to run repeatedly.
#
# Usage:
#   scripts/generate-env.sh [NODE_ENV]        # NODE_ENV defaults to "production"
#
# Environment knobs:
#   ENV_FILE        target file               (default: ./.env)
#   DASHBOARD_PORT  host port of the app      (default: 3000)
#   QUIET=1         do not print credentials / next steps
#
# Works on Linux and macOS. Uses openssl when available, /dev/urandom otherwise.
# =============================================================================

set -euo pipefail

NODE_ENV_VALUE="${1:-production}"
ENV_FILE="${ENV_FILE:-.env}"
DASHBOARD_PORT="${DASHBOARD_PORT:-3000}"
QUIET="${QUIET:-0}"

# random_alnum LENGTH -> prints LENGTH random [A-Za-z0-9] characters.
# The whole random stream is captured before slicing (no `head` in a pipe),
# so `pipefail` cannot trip on SIGPIPE.
random_alnum() {
  local length="$1" raw=""
  while [ "${#raw}" -lt "$length" ]; do
    if command -v openssl >/dev/null 2>&1; then
      raw+="$(openssl rand -base64 $((length * 2)) | LC_ALL=C tr -dc 'A-Za-z0-9')"
    else
      raw+="$(LC_ALL=C tr -dc 'A-Za-z0-9' < <(head -c $((length * 4)) /dev/urandom))"
    fi
  done
  printf '%s' "${raw:0:length}"
}

# random_hex BYTES -> prints 2*BYTES lowercase hex characters.
random_hex() {
  local bytes="$1"
  if command -v openssl >/dev/null 2>&1; then
    openssl rand -hex "$bytes"
  else
    od -An -tx1 -N "$bytes" /dev/urandom | tr -d ' \n'
  fi
}

case "$DASHBOARD_PORT" in
  '' | *[!0-9]*) echo "ERROR: DASHBOARD_PORT must be a number, got '$DASHBOARD_PORT'" >&2; exit 1 ;;
esac
if [ "$DASHBOARD_PORT" -lt 1 ] || [ "$DASHBOARD_PORT" -gt 65535 ]; then
  echo "ERROR: DASHBOARD_PORT must be between 1 and 65535, got '$DASHBOARD_PORT'" >&2
  exit 1
fi

if [ -e "$ENV_FILE" ]; then
  echo "$ENV_FILE already exists - leaving it unchanged."
  exit 0
fi

PG_PASS="$(random_alnum 32)"
REDIS_PASS="$(random_alnum 32)"
ADMIN_PASS="$(random_alnum 24)"
SESSION_SECRET="$(random_alnum 64)"
TOKEN_KEY="$(random_hex 32)"

# Write to a private temp file next to the target, then move it into place,
# so a failure never leaves a half-written .env behind.
umask 077
TMP_FILE="$(mktemp "${ENV_FILE}.XXXXXX")"
trap 'rm -f "$TMP_FILE"' EXIT

cat > "$TMP_FILE" <<EOF
# ==========================================
# GitLab CI/CD Dashboard - Environment Configuration
# ==========================================
# AUTO-GENERATED: $(date -u '+%Y-%m-%d %H:%M:%S UTC')
# KEEP THIS FILE PRIVATE - it contains passwords and secrets.

# ==========================================
# Database Configuration
# ==========================================
POSTGRES_USER=gitlab_dashboard
POSTGRES_PASSWORD=$PG_PASS
POSTGRES_DB=gitlab_dashboard

# ==========================================
# Redis Configuration
# ==========================================
REDIS_PASSWORD=$REDIS_PASS

# ==========================================
# App Configuration
# ==========================================
NODE_ENV=$NODE_ENV_VALUE
DASHBOARD_PORT=$DASHBOARD_PORT
NEXT_PUBLIC_APP_URL=http://localhost:$DASHBOARD_PORT
NEXT_PUBLIC_GITLAB_URL=https://gitlab.com

# ==========================================
# Admin User (auto-created on first run)
# ==========================================
ADMIN_USERNAME=admin
ADMIN_PASSWORD=$ADMIN_PASS
ADMIN_EMAIL=admin@example.com

# ==========================================
# Security
# ==========================================
SESSION_SECRET=$SESSION_SECRET
# Encrypts GitLab tokens stored in the database (AES-256-GCM)
TOKEN_ENCRYPTION_KEY=$TOKEN_KEY
EOF

chmod 600 "$TMP_FILE"
mv "$TMP_FILE" "$ENV_FILE"
trap - EXIT

if [ "$QUIET" = "1" ]; then
  exit 0
fi

echo "Generated $ENV_FILE (permissions 600)."
echo ""
echo "Admin credentials:"
echo "  Username: admin"
echo "  Password: $ADMIN_PASS"
echo ""
echo "Save the password now; it is also stored in $ENV_FILE."
echo "Never commit $ENV_FILE to git."
echo ""
echo "Next steps:"
echo "  docker compose up -d"
echo "  docker compose logs -f app"
