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
#   DASHBOARD_PORT  published port: PORT, IPV4:PORT or [IPV6]:PORT
#                   (default: 3000, i.e. all interfaces)
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

# valid_bind_host HOST -> success for an IPv4 address or a bracketed IPv6 address.
valid_bind_host() {
  local h="$1" octet count=0
  case "$h" in
    \[*\])
      h="${h#\[}"
      h="${h%\]}"
      case "$h" in
        *[!0-9A-Fa-f:.]* | '') return 1 ;;
        *:*) return 0 ;;
        *) return 1 ;;
      esac
      ;;
    *[!0-9.]* | '' | .* | *. | *..*) return 1 ;;
  esac
  local IFS=.
  for octet in $h; do
    count=$((count + 1))
    [ "${#octet}" -le 3 ] && [ "$octet" -le 255 ] || return 1
  done
  [ "$count" -eq 4 ]
}

# validate_port_spec SPEC -> exits unless SPEC is PORT, IPV4:PORT or [IPV6]:PORT.
validate_port_spec() {
  local spec="$1" num="$1" ok=1
  case "$spec" in
    *:*)
      valid_bind_host "${spec%:*}" || ok=0
      num="${spec##*:}"
      ;;
  esac
  case "$num" in
    '' | *[!0-9]*) num=0 ;;
  esac
  if [ "$ok" != 1 ] || [ "$num" -lt 1 ] || [ "$num" -gt 65535 ]; then
    echo "ERROR: DASHBOARD_PORT must be PORT, IPV4:PORT or [IPV6]:PORT (port 1-65535), got '$spec'" >&2
    exit 1
  fi
}

validate_port_spec "$DASHBOARD_PORT"

if [ -e "$ENV_FILE" ]; then
  echo "$ENV_FILE already exists - leaving it unchanged."
  exit 0
fi

PG_PASS="$(random_alnum 32)"
REDIS_PASS="$(random_alnum 32)"
ADMIN_PASS="$(random_alnum 24)"
SESSION_SECRET="$(random_alnum 64)"
TOKEN_KEY="$(random_hex 32)"
WEBHOOK_SECRET="$(random_hex 32)"

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
# Published port: PORT (all interfaces), IPV4:PORT or [IPV6]:PORT,
# e.g. 127.0.0.1:3000 to expose it only behind a local reverse proxy
DASHBOARD_PORT=$DASHBOARD_PORT

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
# Authenticates GitLab webhooks (X-Gitlab-Token). Per-organization webhook
# secrets are derived from it, so changing it breaks existing webhooks.
GITLAB_WEBHOOK_SECRET=$WEBHOOK_SECRET
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
