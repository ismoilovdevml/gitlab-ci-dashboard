# Self-Hosting Guide

How to run GitLab CI/CD Dashboard on your own server: Docker Compose on a VM, a reverse proxy with
HTTPS, backups, upgrades and troubleshooting. For a local trial, the Quick start in the
[README](README.md#quick-start) is enough.

All commands below are run from the install directory (the one containing `docker-compose.yml` and
`.env`, `./gitlab-ci-dashboard` by default).

## Contents

- [Requirements](#requirements)
- [Install on a VM](#install-on-a-vm)
- [Reverse proxy and HTTPS](#reverse-proxy-and-https)
- [Backups](#backups)
- [Upgrades](#upgrades)
- [Troubleshooting](#troubleshooting)

## Requirements

- A Linux VM with Docker Engine and the Docker Compose plugin
  ([install guide](https://docs.docker.com/engine/install/))
- 2 GB RAM and 10 GB of disk are enough for small teams
- A DNS name pointing at the VM, and ports 80 and 443 open, if you want HTTPS
- Network access from the VM to your GitLab instance, and from GitLab to the VM if you use webhooks

The stack from `docker-compose.yml`:

| Service | Image | Exposed | Data |
|---------|-------|---------|------|
| `app` | `ismoilovdevml/gitlab-ci-dashboard:latest` | host port `DASHBOARD_PORT` (default `3000`) | — |
| `postgres` | `postgres:17-alpine` | internal network only | volume `postgres_data` |
| `redis` | `redis:alpine` | internal network only | volume `redis_data` (cache only) |

PostgreSQL holds all persistent state (users, sessions, GitLab connections, alert channels and
history, DORA data). Redis is a cache and rate-limit store and does not need to be backed up.

## Install on a VM

```bash
curl -fsSL https://raw.githubusercontent.com/ismoilovdevml/gitlab-ci-dashboard/main/scripts/install.sh | INSTALL_DIR=/opt/gitlab-ci-dashboard bash
cd /opt/gitlab-ci-dashboard
```

Use `sudo` or a user in the `docker` group. The installer prints the admin password; it is also
stored in `.env` (permissions `600`).

The installer generates `TOKEN_ENCRYPTION_KEY` and `GITLAB_WEBHOOK_SECRET` along with the
passwords. Keep `.env`: without `TOKEN_ENCRYPTION_KEY`, stored GitLab tokens cannot be decrypted,
and changing `GITLAB_WEBHOOK_SECRET` invalidates the secret tokens of every GitLab webhook.

Apply changes to `.env` with:

```bash
docker compose up -d
```

For a manual install without the installer, see [Manual install](README.md#manual-install).

## Reverse proxy and HTTPS

Put the dashboard behind a reverse proxy that terminates TLS. The proxy should send
`X-Forwarded-Proto: https`; the app uses it to mark the session cookie `Secure`.

When the proxy runs on the same host, publish the app on localhost only. `DASHBOARD_PORT` accepts
`port` or `host:port`; set it in `.env` and recreate the container:

```bash
# .env
DASHBOARD_PORT=127.0.0.1:3000
```

```bash
docker compose up -d
```

For a fresh install you can pass it to the installer instead:
`curl -fsSL .../scripts/install.sh | DASHBOARD_PORT=127.0.0.1:3000 bash`. Without this, restrict
port 3000 with your provider's firewall; a host firewall such as `ufw` does not filter ports
published by Docker.

### Caddy

Caddy obtains and renews certificates automatically and sets `X-Forwarded-Proto` by default.

```caddyfile
# /etc/caddy/Caddyfile
ci.example.com {
    reverse_proxy 127.0.0.1:3000
}
```

```bash
sudo systemctl reload caddy
```

### nginx

Example with a certificate from certbot (`sudo certbot certonly --nginx -d ci.example.com`):

```nginx
# /etc/nginx/sites-available/gitlab-ci-dashboard
server {
    listen 80;
    server_name ci.example.com;
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl;
    http2 on;
    server_name ci.example.com;

    ssl_certificate     /etc/letsencrypt/live/ci.example.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/ci.example.com/privkey.pem;

    # GitLab webhook payloads can exceed nginx's 1 MB default.
    client_max_body_size 25m;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 300s;   # large job logs and artifact downloads
    }
}
```

```bash
sudo ln -s /etc/nginx/sites-available/gitlab-ci-dashboard /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
```

`http2 on;` needs nginx 1.25.1 or later; on older versions use `listen 443 ssl http2;` instead.

After HTTPS works, open the dashboard through `https://ci.example.com` and copy the webhook URL and
secret from **Alerting** (see [Webhooks and alerts](README.md#webhooks-and-alerts)). The URL is
built from `X-Forwarded-Proto` and `Host`, so both must reach the app as in the examples above.

## Backups

Back up two things:

1. **The PostgreSQL database.**
2. **`.env`.** It holds `TOKEN_ENCRYPTION_KEY` and `SESSION_SECRET`. A database restored without the
   matching `TOKEN_ENCRYPTION_KEY` has unreadable GitLab tokens.

### Back up

```bash
docker compose exec -T postgres sh -c 'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc' > backup-$(date +%F).dump
```

`pg_dump` runs inside the `postgres` container using its own `POSTGRES_USER` and `POSTGRES_DB`, so
the command works with custom values in `.env`. The app can keep running.

Example daily cron entry (`crontab -e`), keeping 14 days:

```cron
0 3 * * * cd /opt/gitlab-ci-dashboard && mkdir -p backups && docker compose exec -T postgres sh -c 'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc' > backups/db-$(date +\%F).dump && find backups -name 'db-*.dump' -mtime +14 -delete
```

Copy the backups off the VM.

### Restore

Restore replaces the current data. Stop the app so nothing writes during the restore:

```bash
docker compose stop app
docker compose exec -T postgres sh -c 'pg_restore -U "$POSTGRES_USER" -d "$POSTGRES_DB" --clean --if-exists --no-owner' < backup-2026-01-31.dump
docker compose start app
```

Restoring onto a new VM: the old `.env` must be in place before PostgreSQL starts for the first
time, because the database password is set when its volume is created. Prepare the files without
starting, copy the old `.env`, start, then restore:

```bash
curl -fsSL https://raw.githubusercontent.com/ismoilovdevml/gitlab-ci-dashboard/main/scripts/install.sh | INSTALL_DIR=/opt/gitlab-ci-dashboard SKIP_START=1 bash
cp /path/to/old/.env /opt/gitlab-ci-dashboard/.env
cd /opt/gitlab-ci-dashboard
docker compose up -d
```

Then run the restore commands above.

The installer leaves an existing `.env` alone, so you can also copy `.env` into the directory first
and run the installer normally.

## Upgrades

1. Back up the database and `.env` (see [Backups](#backups)).
2. Read the release notes on the
   [releases page](https://github.com/ismoilovdevml/gitlab-ci-dashboard/releases).
3. Pull the new images and recreate the containers:
   ```bash
   docker compose pull
   docker compose up -d
   ```
4. Check that the app started:
   ```bash
   docker compose ps
   docker compose logs --tail=100 app
   ```

Re-running the installer also works and refreshes `docker-compose.yml` from the repository; your
`.env` is kept and a modified `docker-compose.yml` is backed up before being replaced.

If your `docker-compose.yml` is older and its `app` service still has a `command:` that runs
`prisma db push`, replace the file with the current one (re-run the installer, or download
`docker-compose.yml` from the repository) so the database is only changed through migrations.

### Database migrations

The container applies database migrations on every start, before the app starts; there is no
separate migration step. Installs created before migrations were introduced (their database was
set up with `prisma db push`) are detected and baselined automatically on the first start of the
new image.

If a migration fails, the container stops instead of starting the app, and the log shows a line
starting with `[migrate] ERROR`:

```bash
docker compose logs app | grep -A3 '\[migrate\]'
```

Fix the cause, or [roll back](#rolling-back).

**Installs older than v1.1.0** (before alert rules were removed) still have tables that the
automatic baseline will not drop, and the log shows `[migrate] ERROR: Could not bring the database
to the pre-migrate schema without data loss`. Take a backup, then drop the obsolete tables and
start again:

```bash
docker compose exec -T postgres sh -c 'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc' > backup-before-migrate.dump
docker compose run --rm --entrypoint "" app npx prisma db push --schema prisma/legacy/pre-migrate.prisma --skip-generate --accept-data-loss
docker compose up -d
```

This deletes the data in tables and columns that no longer exist in the schema.

Contributors apply migrations locally with `npm run db:migrate`; see
[CONTRIBUTING.md](CONTRIBUTING.md#database-changes).

### Rolling back

The `latest` image follows the `main` branch. Images are also tagged `main-<short commit sha>` on
[Docker Hub](https://hub.docker.com/r/ismoilovdevml/gitlab-ci-dashboard/tags). To roll back, set
`image:` of the `app` service in `docker-compose.yml` to the previous tag, restore the backup taken
in step 1 and run `docker compose up -d`.

## Troubleshooting

### Logs and status

```bash
docker compose ps                 # container state and health
docker compose logs -f app        # dashboard
docker compose logs postgres      # database
docker compose logs redis         # cache
```

### No admin user / cannot log in after the first start

The admin is created from `.env` on first start. If `ADMIN_PASSWORD` is missing, shorter than 12
characters or still starts with `CHANGE_ME`, the app starts anyway but no admin is created. The app
log shows:

```
Seed failed: Error: Cannot create admin user: ADMIN_PASSWORD ...
WARNING: admin user seed failed; starting anyway.
```

Fix `ADMIN_PASSWORD` in `.env` and recreate the container, which retries the admin creation:

```bash
docker compose up -d
docker compose logs app | grep -i admin
```

`ADMIN_PASSWORD` is only used when the admin does not exist yet. Changing it later does not change
the password of an existing admin; change it in the dashboard under **Settings** instead.

### GitLab tokens cannot be decrypted after an upgrade

Older installs encrypted GitLab tokens with `LICENSE_ENCRYPTION_KEY`. Current versions use
`TOKEN_ENCRYPTION_KEY`, and the current `docker-compose.yml` no longer passes
`LICENSE_ENCRYPTION_KEY` to the app. If your `.env` has `LICENSE_ENCRYPTION_KEY`, set
`TOKEN_ENCRYPTION_KEY` to the same value:

```bash
# .env
TOKEN_ENCRYPTION_KEY=<value of LICENSE_ENCRYPTION_KEY>
```

```bash
docker compose up -d
```

Do not generate a new key in this case: tokens encrypted with the old key would become unreadable
and have to be re-entered in **Settings**.

### Webhooks return 401, 404 or 503

- **401:** the secret token in GitLab does not match. For a `?org=<id>` URL it must be that
  organization's secret from **Alerting**; for the plain URL it must equal `GITLAB_WEBHOOK_SECRET`.
  Changing `GITLAB_WEBHOOK_SECRET` changes every organization's secret, so update the webhooks in
  GitLab afterwards.
- **404:** the organization in `?org=` does not exist.
- **503:** `GITLAB_WEBHOOK_SECRET` is not set; per-organization URLs require it. Set it and run
  `docker compose up -d`.

Use **Test** in GitLab's webhook settings and check `docker compose logs app`.

### Connecting to GitLab fails with a redirect error

The dashboard does not follow redirects from GitLab. Enter the final URL in **Settings**: use
`https://` if GitLab redirects HTTP to HTTPS, and the exact host and path GitLab is served on.

### Port already in use

Set another port in `.env` (`DASHBOARD_PORT=8080`) and run `docker compose up -d`.

### Start over

This deletes all data, including the database:

```bash
docker compose down -v
```
