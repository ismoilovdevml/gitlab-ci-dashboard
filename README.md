# GitLab CI/CD Dashboard

Modern, real-time dashboard for monitoring and managing GitLab CI/CD pipelines with advanced alerting system.

![Next.js](https://img.shields.io/badge/Next.js-15-black) ![TypeScript](https://img.shields.io/badge/TypeScript-5.9-blue) ![Docker](https://img.shields.io/badge/docker-ready-brightgreen) ![PostgreSQL](https://img.shields.io/badge/PostgreSQL-17-blue) ![Redis](https://img.shields.io/badge/Redis-latest-red)

## Features

- **Real-time Pipeline Monitoring** — Auto-refresh with live updates
- **GitLab-style Visualization** — Beautiful pipeline stages & jobs view
- **Live Log Streaming** — Real-time logs with syntax highlighting
- **Pipeline Management** — Retry, cancel, and manage pipelines
- **DORA Metrics** — Deployment frequency, lead time, change failure rate, MTTR
- **Alert System** — Slack, Telegram, Discord, email notifications
- **Dark & Light Themes** — Comfortable viewing in any environment
- **Responsive Design** — Works on desktop, tablet, and mobile

## Quick Start (One-liner)

Install with a single command — no repository access needed:

```bash
curl -fsSL https://cidash.dev/api/install?file=install | bash
```

This will:

1. Check that Docker and Docker Compose are installed
2. Download `docker-compose.yml` from cidash.dev
3. Generate a `.env` file with secure random passwords
4. Pull the Docker image from Docker Hub
5. Start PostgreSQL, Redis, and the dashboard

After installation, open `http://localhost:3000` and log in with the credentials shown in the terminal.

### Install with License Key (Pro/Enterprise)

```bash
LICENSE_KEY="eyJ..." curl -fsSL https://cidash.dev/api/install?file=install | bash
```

### Install with Custom Port

```bash
DASHBOARD_PORT=8080 curl -fsSL https://cidash.dev/api/install?file=install | bash
```

### Install to Custom Directory

```bash
INSTALL_DIR=/opt/cidash curl -fsSL https://cidash.dev/api/install?file=install | bash
```

## Manual Installation

If you prefer not to pipe curl to bash:

```bash
# 1. Create a directory
mkdir gitlab-ci-dashboard && cd gitlab-ci-dashboard

# 2. Download docker-compose.yml
curl -fsSL "https://cidash.dev/api/install?file=docker-compose" -o docker-compose.yml

# 3. Generate secure .env
cat > .env << 'ENVEOF'
POSTGRES_USER=gitlab_dashboard
POSTGRES_PASSWORD=CHANGE_ME
POSTGRES_DB=gitlab_dashboard
REDIS_PASSWORD=CHANGE_ME
NODE_ENV=production
NEXT_PUBLIC_APP_URL=http://localhost:3000
NEXT_PUBLIC_GITLAB_URL=https://gitlab.com
ADMIN_USERNAME=admin
ADMIN_PASSWORD=CHANGE_ME
ADMIN_EMAIL=admin@example.com
SESSION_SECRET=CHANGE_ME_64_CHARS_MINIMUM
ENVEOF

# Replace CHANGE_ME values with secure random strings:
sed -i.bak "s/POSTGRES_PASSWORD=CHANGE_ME/POSTGRES_PASSWORD=$(openssl rand -base64 24 | tr -dc A-Za-z0-9 | head -c 32)/" .env
sed -i.bak "s/REDIS_PASSWORD=CHANGE_ME/REDIS_PASSWORD=$(openssl rand -base64 24 | tr -dc A-Za-z0-9 | head -c 32)/" .env
sed -i.bak "s/ADMIN_PASSWORD=CHANGE_ME/ADMIN_PASSWORD=$(openssl rand -base64 24 | tr -dc A-Za-z0-9 | head -c 24)/" .env
sed -i.bak "s/SESSION_SECRET=CHANGE_ME_64_CHARS_MINIMUM/SESSION_SECRET=$(openssl rand -base64 48 | tr -dc A-Za-z0-9 | head -c 64)/" .env
rm -f .env.bak
chmod 600 .env

# 4. Start all services
docker compose up -d

# 5. Check logs
docker compose logs -f app
```

## First Login

- **URL:** `http://localhost:3000/login`
- **Username:** `admin` (or the value from `ADMIN_USERNAME` in `.env`)
- **Password:** Check `ADMIN_PASSWORD` in your `.env` file

## Configuration

### Connect to GitLab

1. Open `http://localhost:3000`
2. Click **Settings** in the sidebar
3. Enter your GitLab details:
   - **GitLab URL**: `https://gitlab.com` or your self-hosted GitLab URL
   - **API Token**: Personal access token with `api` scope
4. Click **Save Configuration**

**Get an API Token:**

1. Go to GitLab → Settings → Access Tokens
2. Create a token with `api` scope
3. Copy and paste it in the dashboard

### License Key (Optional)

Without a license, the dashboard runs in free tier (3 projects, 1 user). To unlock more:

1. Purchase a license at [cidash.dev/pricing](https://cidash.dev/pricing)
2. Add to your `.env` file: `LICENSE_KEY=eyJ...`
3. Restart: `docker compose restart app`

## Managing the Dashboard

```bash
# View logs
docker compose logs -f app

# Stop all services
docker compose down

# Stop and remove all data (reset)
docker compose down -v

# Restart services
docker compose restart
```

## Update to Latest Version

The dashboard checks for updates automatically and shows a notification in the sidebar.

```bash
# Pull latest image and restart
docker compose pull app && docker compose up -d
```

## Prerequisites

- **Docker Engine** 20.0 or later
- **Docker Compose** v2 (plugin) or standalone
- **2 GB RAM** minimum
- **10 GB disk** minimum
- Linux, macOS, or Windows with WSL2

## Architecture

| Service    | Image                                      | Port     | Purpose             |
|------------|--------------------------------------------|----------|---------------------|
| PostgreSQL | `postgres:17-alpine`                       | Internal | Database            |
| Redis      | `redis:alpine`                             | Internal | Cache & sessions    |
| App        | `ismoilovdevml/gitlab-ci-dashboard:latest` | 3000     | Dashboard (Next.js) |

PostgreSQL and Redis are isolated on an internal Docker network and are not exposed to the host. Only the app port (default 3000) is accessible.

## Tech Stack

- **Framework**: Next.js 15 (App Router) + React 19
- **Language**: TypeScript 5.9
- **Database**: PostgreSQL 17 + Prisma ORM
- **Cache**: Redis
- **Styling**: Tailwind CSS
- **State**: Zustand with persistence

## Security

- All database credentials are auto-generated with `openssl rand`
- PostgreSQL and Redis are on internal Docker networks only
- `.env` file permissions are set to `600` (owner read/write only)
- Session tokens use a 64-character cryptographically random secret
- GitLab tokens are encrypted at rest (AES-256-GCM) in Enterprise mode

## Documentation

- **Installation guide:** [cidash.dev/install](https://cidash.dev/install)
- **Cloud vs Self-Hosted:** [cidash.dev/cloud-vs-self-hosted](https://cidash.dev/cloud-vs-self-hosted)
- **Pricing & Licensing:** [cidash.dev/pricing](https://cidash.dev/pricing)

## Support

For questions, bug reports, or feature requests, contact us at [cidash.dev](https://cidash.dev).
