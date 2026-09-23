# GitLab CI/CD Dashboard

Self-hosted dashboard for monitoring GitLab CI/CD pipelines, jobs, runners and deployments.
It runs as three containers (Next.js app, PostgreSQL, Redis) and works with GitLab.com or a
self-managed GitLab instance.

MIT licensed. No feature limits, no accounts outside your own server.

![Next.js](https://img.shields.io/badge/Next.js-15-black) ![TypeScript](https://img.shields.io/badge/TypeScript-5.9-blue) ![PostgreSQL](https://img.shields.io/badge/PostgreSQL-17-blue) ![License: MIT](https://img.shields.io/badge/license-MIT-green)

## Features

- **Overview and pipelines** — pipeline status across projects with auto-refresh, stage and job
  visualization, pipeline statistics
- **Job logs** — log viewer for job output
- **Pipeline actions** — retry and cancel pipelines and jobs
- **Projects and runners** — project list with details, runner status
- **Artifacts and container registry** — browse, download and delete job artifacts and registry tags
- **Analytics** — DORA metrics (deployment frequency, lead time, change failure rate, MTTR) and trends
- **Alerting** — GitLab webhook events forwarded to Slack, Telegram or Discord, with alert history
- **Dark and light themes**, responsive layout

## Quick start

Requirements: a Linux or macOS host with Docker Engine, Docker Compose and `curl`, and a free
port for the dashboard (default 3000).

```bash
curl -fsSL https://raw.githubusercontent.com/ismoilovdevml/gitlab-ci-dashboard/main/scripts/install.sh | bash
```

The installer:

1. checks that Docker, Docker Compose and the Docker daemon are available;
2. downloads `docker-compose.yml` and `.env.example` into `./gitlab-ci-dashboard`;
3. generates `.env` with random secrets (an existing `.env` is never overwritten);
4. pulls the images and starts PostgreSQL, Redis and the dashboard;
5. prints the URL and the admin username and password.

Options are environment variables. Put them on the `bash` side of the pipe, not before `curl`:

```bash
curl -fsSL https://raw.githubusercontent.com/ismoilovdevml/gitlab-ci-dashboard/main/scripts/install.sh | DASHBOARD_PORT=8080 INSTALL_DIR=/opt/gitlab-ci-dashboard bash
```

| Variable | Default | Purpose |
|----------|---------|---------|
| `INSTALL_DIR` | `./gitlab-ci-dashboard` | Where the files are installed |
| `DASHBOARD_PORT` | `3000` (or the value in an existing `.env`) | Host port for the dashboard |
| `INSTALL_REF` | `main` | Git branch or tag to download files from |
| `SKIP_START=1` | unset | Only prepare the files; do not check Docker, pull or start |

Re-running the installer is safe: `.env` is kept, `docker-compose.yml` is refreshed (a changed copy
is backed up first) and the stack is updated.

Then open `http://localhost:3000`, log in, go to **Settings** and connect GitLab
(see [GitLab access token](#gitlab-access-token)).

## Manual install

Either clone the repository:

```bash
git clone https://github.com/ismoilovdevml/gitlab-ci-dashboard.git
cd gitlab-ci-dashboard
./scripts/generate-env.sh      # writes .env with random secrets and prints the admin password
docker compose up -d
```

or download only the two files you need:

```bash
mkdir gitlab-ci-dashboard && cd gitlab-ci-dashboard
curl -fsSLO https://raw.githubusercontent.com/ismoilovdevml/gitlab-ci-dashboard/main/docker-compose.yml
curl -fsSL https://raw.githubusercontent.com/ismoilovdevml/gitlab-ci-dashboard/main/.env.example -o .env
chmod 600 .env
```

Edit `.env` and replace every `CHANGE_ME...` value (for example with `openssl rand -hex 32`;
`ADMIN_PASSWORD` must be at least 12 characters). Then start the stack:

```bash
docker compose up -d
docker compose logs -f app
```

The admin user is created on first start from `ADMIN_USERNAME` / `ADMIN_PASSWORD`. If
`ADMIN_PASSWORD` is missing, shorter than 12 characters or still starts with `CHANGE_ME`, no admin
is created — see [Troubleshooting](DEPLOY.md#troubleshooting).

For running behind a domain with HTTPS, backups and upgrades, see [DEPLOY.md](DEPLOY.md).

## Configuration

All settings live in `.env` next to `docker-compose.yml`. After editing it, apply the change with
`docker compose up -d`.

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `POSTGRES_USER` | no | `gitlab_dashboard` | PostgreSQL user |
| `POSTGRES_PASSWORD` | yes | — | PostgreSQL password |
| `POSTGRES_DB` | no | `gitlab_dashboard` | PostgreSQL database name |
| `REDIS_PASSWORD` | yes | — | Redis password |
| `NODE_ENV` | no | `production` | Node.js environment; keep `production` |
| `DASHBOARD_PORT` | no | `3000` | Host port the dashboard is published on |
| `NEXT_PUBLIC_APP_URL` | no | `http://localhost:3000` | Public URL of the dashboard. Passed to the container but not currently read by the app |
| `ADMIN_USERNAME` | no | `admin` | Username of the initial admin |
| `ADMIN_PASSWORD` | yes | — | Password of the initial admin, at least 12 characters, not the `CHANGE_ME` placeholder. Used only when the admin is first created |
| `ADMIN_EMAIL` | no | `admin@example.com` | Email of the initial admin |
| `SESSION_SECRET` | yes | — | Signs sessions and CSRF tokens. Use a long random value (`openssl rand -hex 32`) |
| `TOKEN_ENCRYPTION_KEY` | recommended | — | Encrypts GitLab tokens stored in the database (AES-256-GCM). If unset, tokens are stored in plain text. `openssl rand -hex 32` |
| `GITLAB_WEBHOOK_SECRET` | recommended | — | Expected `X-Gitlab-Token` of incoming GitLab webhooks. If unset, webhook requests are not authenticated |

`DATABASE_URL` and `REDIS_URL` are built by `docker-compose.yml` from the values above; you do not
set them yourself unless you run the app outside Compose.

Keep `.env` private and back it up: losing `TOKEN_ENCRYPTION_KEY` means stored GitLab tokens can no
longer be decrypted and have to be entered again.

## GitLab access token

The GitLab URL and token are set in the dashboard under **Settings**, not in `.env`. Create a
personal (or group/project) access token in GitLab under **User settings > Access tokens**:

| Scope | What works |
|-------|------------|
| `read_api` | Everything read-only: pipelines, jobs, logs, projects, runners, artifacts, registry, analytics |
| `api` | Additionally: retry and cancel pipelines and jobs, delete artifacts, delete registry tags and repositories, star and unstar projects |

Use `read_api` if you only need monitoring. The token is stored encrypted when
`TOKEN_ENCRYPTION_KEY` is set.

## Webhooks and alerts

Alerts are sent when GitLab calls the dashboard's webhook endpoint:

1. Set a secret in `.env` and apply it:
   ```bash
   echo "GITLAB_WEBHOOK_SECRET=$(openssl rand -hex 32)" >> .env
   docker compose up -d
   ```
   The installer does not generate this value; add it yourself. If `.env` already contains a
   `GITLAB_WEBHOOK_SECRET` line (for example the placeholder from `.env.example`), edit that line
   instead of appending a second one.
2. In the dashboard, open **Alerting** and add a Slack, Telegram or Discord channel.
3. In GitLab, open the project's **Settings > Webhooks** and add a webhook:
   - **URL:** `https://<your-dashboard-host>/api/webhook/gitlab`
   - **Secret token:** the value of `GITLAB_WEBHOOK_SECRET`
   - **Trigger:** Pipeline events (other events such as job, push, merge request, tag, deployment
     and release are also accepted)

GitLab must be able to reach the dashboard; `localhost` URLs do not work for webhooks.

## Upgrading

Back up the database first, then pull the new images and recreate the containers:

```bash
docker compose exec -T postgres sh -c 'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc' > backup-$(date +%F).dump
docker compose pull
docker compose up -d
```

Re-running the installer does the same and also refreshes `docker-compose.yml`. Restore
instructions are in [DEPLOY.md](DEPLOY.md#backups).

## Development

See [CONTRIBUTING.md](CONTRIBUTING.md) for the local development setup, checks and pull request
process.

## Security

Report vulnerabilities privately as described in [SECURITY.md](SECURITY.md). Do not open a public
issue.

## License

[MIT](LICENSE)
