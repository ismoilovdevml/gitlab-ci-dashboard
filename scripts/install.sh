#!/usr/bin/env bash
# =============================================================================
# GitLab CI/CD Dashboard - self-hosted installer
#
#   curl -fsSL https://raw.githubusercontent.com/ismoilovdevml/gitlab-ci-dashboard/main/scripts/install.sh | bash
#
# Options are environment variables. Put them in front of `bash`, not `curl`:
#
#   curl -fsSL .../scripts/install.sh | DASHBOARD_PORT=8080 INSTALL_DIR=/opt/cidash bash
#
#   INSTALL_DIR     where to install            (default: ./gitlab-ci-dashboard)
#   DASHBOARD_PORT  host port for the dashboard (default: 3000, or the value in an existing .env)
#   INSTALL_REF     git branch/tag to fetch     (default: main)
#   SKIP_START=1    only prepare files; do not check Docker, pull or start
#   INSTALL_BASE_URL  raw file base URL (default: raw.githubusercontent.com for INSTALL_REF;
#                     override only for forks or local testing)
#
# What it does:
#   1. checks Docker, Docker Compose and that the Docker daemon is running
#   2. downloads docker-compose.yml and .env.example from this GitHub repository
#   3. generates .env with random secrets (an existing .env is never overwritten)
#   4. pulls the images and starts PostgreSQL, Redis and the dashboard
#   5. prints the login URL and admin credentials
#
# Re-running is safe: .env is kept, docker-compose.yml is refreshed (a changed
# copy is backed up first) and the stack is updated with `up -d`.
# =============================================================================

# Refuse non-bash shells before using any bash-only syntax.
if [ -z "${BASH_VERSION:-}" ]; then
  echo "ERROR: this installer requires bash. Run it with: curl -fsSL <url> | bash" >&2
  exit 1
fi

set -euo pipefail

# Compose command; replaced by detect_compose. A global array (no namerefs)
# keeps the script compatible with the bash 3.2 that ships with macOS.
COMPOSE=(docker compose)
TMP_DIR=""

# Everything runs inside main(), which is only called on the last line, so a
# truncated download cannot execute a partial script.
main() {
  local repo_slug="ismoilovdevml/gitlab-ci-dashboard"
  local ref="${INSTALL_REF:-main}"
  local base_url="${INSTALL_BASE_URL:-https://raw.githubusercontent.com/${repo_slug}/${ref}}"
  local install_dir="${INSTALL_DIR:-gitlab-ci-dashboard}"
  local requested_port="${DASHBOARD_PORT:-}"
  local skip_start="${SKIP_START:-0}"

  setup_colors

  printf '\n%sGitLab CI/CD Dashboard installer%s\n' "$BOLD" "$NC"

  header "Checking prerequisites"
  need_cmd curl
  if [ "$skip_start" = "1" ]; then
    warn "SKIP_START=1: skipping Docker checks, image pull and start"
  else
    check_docker
    detect_compose
  fi

  header "Preparing $install_dir"
  mkdir -p "$install_dir"
  install_dir="$(cd "$install_dir" && pwd -P)"
  success "Install directory: $install_dir"

  TMP_DIR="$(mktemp -d)"
  trap 'rm -rf "$TMP_DIR"' EXIT

  header "Downloading files from github.com/${repo_slug} (${ref})"
  download "$base_url/docker-compose.yml" "$TMP_DIR/docker-compose.yml"
  download "$base_url/.env.example" "$TMP_DIR/.env.example"
  download "$base_url/scripts/generate-env.sh" "$TMP_DIR/generate-env.sh"

  grep -q '^services:' "$TMP_DIR/docker-compose.yml" ||
    fatal "Downloaded docker-compose.yml does not look like a Compose file"

  # Resolve the port: an existing .env is the source of truth.
  local env_file="$install_dir/.env"
  local env_created=0 port existing_port=""
  if [ -f "$env_file" ]; then
    existing_port="$(env_get DASHBOARD_PORT "$env_file")"
  fi
  if [ -n "$existing_port" ]; then
    port="$existing_port"
    if [ -n "$requested_port" ] && [ "$requested_port" != "$existing_port" ]; then
      warn "DASHBOARD_PORT=$requested_port ignored: existing .env sets DASHBOARD_PORT=$existing_port"
      warn "Edit $env_file (DASHBOARD_PORT and NEXT_PUBLIC_APP_URL) to change it"
    fi
  elif [ -f "$env_file" ]; then
    port="${requested_port:-3000}"
    if [ "$port" != "3000" ]; then
      warn "Existing .env has no DASHBOARD_PORT; using $port for this run only."
      warn "Add DASHBOARD_PORT=$port to $env_file to make it permanent."
    fi
  else
    port="${requested_port:-3000}"
  fi
  validate_port "$port"

  # Make the published host port configurable in the downloaded compose file.
  if ! grep -q 'DASHBOARD_PORT' "$TMP_DIR/docker-compose.yml"; then
    if grep -q '"3000:3000"' "$TMP_DIR/docker-compose.yml"; then
      # shellcheck disable=SC2016 # literal ${DASHBOARD_PORT} is meant for Compose
      sed 's/"3000:3000"/"${DASHBOARD_PORT:-3000}:3000"/' \
        "$TMP_DIR/docker-compose.yml" > "$TMP_DIR/docker-compose.patched.yml"
      mv "$TMP_DIR/docker-compose.patched.yml" "$TMP_DIR/docker-compose.yml"
    elif [ "$port" != "3000" ]; then
      warn "Could not find the app port mapping in docker-compose.yml; DASHBOARD_PORT may not apply"
    fi
  fi

  install_file "$TMP_DIR/docker-compose.yml" "$install_dir/docker-compose.yml"
  install_file "$TMP_DIR/.env.example" "$install_dir/.env.example"

  header "Configuring secrets"
  if [ -f "$env_file" ]; then
    success "Keeping existing .env (never overwritten)"
  else
    ENV_FILE="$env_file" DASHBOARD_PORT="$port" QUIET=1 \
      bash "$TMP_DIR/generate-env.sh" production
    [ -f "$env_file" ] || fatal "Failed to generate $env_file"
    env_created=1
    success "Generated .env with random secrets (permissions 600)"
  fi

  if [ "$skip_start" != "1" ]; then
    # Compose reads .env from the project directory; the exported value keeps
    # the port consistent even if the caller's environment set another one.
    export DASHBOARD_PORT="$port"
    cd "$install_dir"

    header "Pulling images"
    "${COMPOSE[@]}" pull || fatal "Image pull failed. Check your network and try: cd $install_dir && ${COMPOSE[*]} pull"
    success "Images pulled"

    header "Starting services"
    "${COMPOSE[@]}" up -d || fatal "Failed to start. Inspect with: cd $install_dir && ${COMPOSE[*]} logs"
    success "Containers started"

    wait_for_http "http://localhost:$port/login" 180
  fi

  print_summary "$install_dir" "$port" "$env_file" "$env_created" "$skip_start" "${COMPOSE[*]}"
}

# ---------------------------------------------------------------------------
# Output helpers
# ---------------------------------------------------------------------------
setup_colors() {
  if [ -t 1 ] && [ -z "${NO_COLOR:-}" ]; then
    BOLD=$'\033[1m' RED=$'\033[0;31m' GREEN=$'\033[0;32m' YELLOW=$'\033[1;33m' CYAN=$'\033[0;36m' NC=$'\033[0m'
  else
    BOLD='' RED='' GREEN='' YELLOW='' CYAN='' NC=''
  fi
}

header()  { printf '\n%s==> %s%s\n' "$CYAN" "$*" "$NC"; }
success() { printf '%s[ok]%s    %s\n' "$GREEN" "$NC" "$*"; }
warn()    { printf '%s[warn]%s  %s\n' "$YELLOW" "$NC" "$*" >&2; }
fatal()   { printf '%s[error]%s %s\n' "$RED" "$NC" "$*" >&2; exit 1; }

# ---------------------------------------------------------------------------
# Checks
# ---------------------------------------------------------------------------
need_cmd() {
  command -v "$1" >/dev/null 2>&1 || fatal "'$1' is required but not installed"
  success "$1 found"
}

check_docker() {
  command -v docker >/dev/null 2>&1 ||
    fatal "Docker is not installed. See https://docs.docker.com/engine/install/"
  success "docker found"
  docker info >/dev/null 2>&1 ||
    fatal "Cannot talk to the Docker daemon. Start Docker (or check permissions: are you in the 'docker' group?)"
  success "Docker daemon is running"
}

# detect_compose -> sets the global COMPOSE array (v2 plugin preferred).
detect_compose() {
  if docker compose version >/dev/null 2>&1; then
    COMPOSE=(docker compose)
  elif command -v docker-compose >/dev/null 2>&1; then
    COMPOSE=(docker-compose)
  else
    fatal "Docker Compose is not installed. See https://docs.docker.com/compose/install/"
  fi
  success "Compose: ${COMPOSE[*]}"
}

validate_port() {
  case "$1" in
    '' | *[!0-9]*) fatal "DASHBOARD_PORT must be a number, got '$1'" ;;
  esac
  if [ "$1" -lt 1 ] || [ "$1" -gt 65535 ]; then
    fatal "DASHBOARD_PORT must be between 1 and 65535, got '$1'"
  fi
}

# ---------------------------------------------------------------------------
# File helpers
# ---------------------------------------------------------------------------
download() {
  curl -fsSL --retry 3 --connect-timeout 15 -o "$2" "$1" || fatal "Download failed: $1"
  [ -s "$2" ] || fatal "Downloaded file is empty: $1"
  success "Downloaded $(basename "$2")"
}

# install_file SRC DEST -> replace DEST, backing up a differing existing copy.
install_file() {
  local src="$1" dest="$2"
  if [ -f "$dest" ]; then
    if cmp -s "$src" "$dest"; then
      success "$(basename "$dest") is up to date"
      return 0
    fi
    local backup
    backup="$dest.bak.$(date +%Y%m%d%H%M%S)"
    cp -p "$dest" "$backup"
    warn "Existing $(basename "$dest") changed upstream; previous copy saved to $backup"
  fi
  cp "$src" "$dest"
  success "Installed $(basename "$dest")"
}

# env_get KEY FILE -> value of the last KEY=... line (empty if missing).
env_get() {
  local line
  line="$(grep -E "^$1=" "$2" | tail -n 1 || true)"
  line="${line#*=}"
  line="${line%\"}"
  line="${line#\"}"
  printf '%s' "$line"
}

wait_for_http() {
  local url="$1" timeout="$2" waited=0
  printf 'Waiting for %s (up to %ss; first start runs database setup)' "$url" "$timeout"
  while [ "$waited" -lt "$timeout" ]; do
    if curl -fsS -o /dev/null --max-time 5 "$url" 2>/dev/null; then
      printf '\n'
      success "Dashboard is responding"
      return 0
    fi
    printf '.'
    sleep 3
    waited=$((waited + 3))
  done
  printf '\n'
  warn "Dashboard did not respond within ${timeout}s. It may still be starting."
  warn "Check progress with: cd $PWD && docker compose logs -f app"
  return 0
}

print_summary() {
  local dir="$1" port="$2" env_file="$3" created="$4" skipped="$5" compose_cmd="$6"
  local user pass
  user="$(env_get ADMIN_USERNAME "$env_file")"
  pass="$(env_get ADMIN_PASSWORD "$env_file")"

  header "Done"
  printf '  %sDashboard URL:%s  http://localhost:%s\n' "$BOLD" "$NC" "$port"
  printf '  %sUsername:%s       %s\n' "$BOLD" "$NC" "${user:-admin}"
  if [ "$created" = "1" ]; then
    printf '  %sPassword:%s       %s\n' "$BOLD" "$NC" "$pass"
    printf '\n  Save this password. It is also stored in %s\n' "$env_file"
  else
    printf '  %sPassword:%s       unchanged (ADMIN_PASSWORD in %s is used only when the admin is first created)\n' \
      "$BOLD" "$NC" "$env_file"
  fi
  printf '\n  Useful commands (run in %s):\n' "$dir"
  if [ "$skipped" = "1" ]; then
    printf '    Start:   %s up -d\n' "$compose_cmd"
  fi
  printf '    Logs:    %s logs -f app\n' "$compose_cmd"
  printf '    Status:  %s ps\n' "$compose_cmd"
  printf '    Stop:    %s down\n' "$compose_cmd"
  printf '    Update:  %s pull && %s up -d\n\n' "$compose_cmd" "$compose_cmd"
}

main "$@"
