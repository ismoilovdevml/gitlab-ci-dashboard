# Deployment

Running the dashboard on a server: install on a VM, put it behind a reverse proxy with HTTPS, back
it up and upgrade it.

All commands run in the install directory, the one with `docker-compose.yml` and `.env`
(`/opt/gitlab-ci-dashboard` in the examples).

## Requirements

- A Linux VM with Docker Engine and the Docker Compose plugin
- 2 GB RAM and 10 GB of disk for a small team
- A DNS name pointing at the VM and ports 80 and 443 open, for HTTPS
- Network access from the VM to GitLab, and from GitLab to the VM if you use
  [webhooks](/features/alerting)

PostgreSQL holds all persistent state (users, sessions, GitLab connections, alert channels and
history, recorded DORA data). The Analytics page reads its DORA metrics from GitLab. Redis holds
caches and rate-limit counters and does not need a backup.

## Install on a VM

Publish the dashboard on localhost only, so that it is reachable just through the proxy:

```bash
curl -fsSL https://raw.githubusercontent.com/ismoilovdevml/gitlab-ci-dashboard/main/scripts/install.sh | INSTALL_DIR=/opt/gitlab-ci-dashboard DASHBOARD_PORT=127.0.0.1:3000 bash
cd /opt/gitlab-ci-dashboard
```

Use `sudo` or a user in the `docker` group. The installer prints the admin password; it is also
stored in `.env` (mode `600`).

For an existing install, set it in `.env` and recreate the container:

```bash
# .env
DASHBOARD_PORT=127.0.0.1:3000
```

```bash
docker compose up -d
```

::: warning Host firewalls do not filter Docker ports
`ufw` and similar host firewalls do not filter ports published by Docker. If the app is published
on all interfaces, restrict port 3000 with your provider's firewall, or use
`DASHBOARD_PORT=127.0.0.1:3000`.
:::

## Reverse proxy and HTTPS

Put the dashboard behind a reverse proxy that terminates TLS. The proxy must send
`X-Forwarded-Proto: https`: the app uses it to mark the session cookie `Secure` and to build the
webhook URL shown under **Alerting**.

### Caddy

Caddy obtains and renews certificates automatically and sets `X-Forwarded-Proto` by default.

```text
# /etc/caddy/Caddyfile
ci.example.com {
    reverse_proxy 127.0.0.1:3000
}
```

```bash
sudo systemctl reload caddy
```

### nginx

With a certificate from certbot (`sudo certbot certonly --nginx -d ci.example.com`):

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

`http2 on;` needs nginx 1.25.1 or later; on older versions use `listen 443 ssl http2;`.

After HTTPS works, open the dashboard at `https://ci.example.com` and copy the webhook URL and
secret from **Alerting → Webhook Setup**. The URL is built from `X-Forwarded-Proto` and the host
header, so both must reach the app as in the examples above.

## Backups

Back up two things:

1. **The PostgreSQL database.**
2. **`.env`.** It holds `TOKEN_ENCRYPTION_KEY` and the other secrets. A database restored
   without the matching `TOKEN_ENCRYPTION_KEY` has unreadable GitLab tokens.

### Back up

```bash
docker compose exec -T postgres sh -c 'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc' > backup-$(date +%F).dump
```

`pg_dump` runs inside the `postgres` container with that container's `POSTGRES_USER` and
`POSTGRES_DB`, so the command works with custom values in `.env`. The app can keep running.

A daily cron entry (`crontab -e`) that keeps 14 days:

```text
0 3 * * * cd /opt/gitlab-ci-dashboard && mkdir -p backups && docker compose exec -T postgres sh -c 'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc' > backups/db-$(date +\%F).dump && find backups -name 'db-*.dump' -mtime +14 -delete
```

Copy the backups off the VM.

### Restore

A restore replaces the current data. Stop the app so nothing writes during the restore:

```bash
docker compose stop app
docker compose exec -T postgres sh -c 'pg_restore -U "$POSTGRES_USER" -d "$POSTGRES_DB" --clean --if-exists --no-owner' < backup-2026-01-31.dump
docker compose start app
```

### Restore onto a new VM

The old `.env` must be in place before PostgreSQL starts for the first time, because the database
password is set when its volume is created. Prepare the files without starting, copy the old
`.env`, start, then run the restore above:

```bash
curl -fsSL https://raw.githubusercontent.com/ismoilovdevml/gitlab-ci-dashboard/main/scripts/install.sh | INSTALL_DIR=/opt/gitlab-ci-dashboard SKIP_START=1 bash
cp /path/to/old/.env /opt/gitlab-ci-dashboard/.env
cd /opt/gitlab-ci-dashboard
docker compose up -d
```

The installer never overwrites an existing `.env`, so you can also copy `.env` into the directory
first and run the installer normally.

## Upgrades

1. Back up the database and `.env`.
2. Read the [release notes](https://github.com/ismoilovdevml/gitlab-ci-dashboard/releases).
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

Re-running the installer does the same and also refreshes `docker-compose.yml`; `.env` is kept
and a modified `docker-compose.yml` is backed up before it is replaced.

If your `docker-compose.yml` is old and its `app` service still has a `command:` that runs
`prisma db push`, replace the file with the current one (re-run the installer, or download
`docker-compose.yml` again) so the database only changes through migrations.

### Automatic migrations

The container applies database migrations on every start, before the app starts; there is no
separate migration step. Installs created before migrations were introduced (their database was
set up with `prisma db push`) are detected and baselined automatically on the first start of the
new image.

If a migration fails, the container stops instead of starting the app, and the log has a line
starting with `[migrate] ERROR`:

```bash
docker compose logs app | grep -A3 '\[migrate\]'
```

Fix the cause, or [roll back](#rolling-back).

**Installs older than v1.1.0** still have tables that the automatic baseline will not drop, and
the log shows `[migrate] ERROR: Could not bring the database to the pre-migrate schema without
data loss`. Take a backup, drop the obsolete tables, and start again:

```bash
docker compose exec -T postgres sh -c 'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc' > backup-before-migrate.dump
docker compose run --rm --entrypoint "" app npx prisma db push --schema prisma/legacy/pre-migrate.prisma --skip-generate --accept-data-loss
docker compose up -d
```

This deletes the data in tables and columns that no longer exist in the schema.

### Rolling back

The `latest` image follows the `main` branch. Every image is also tagged `main-<short commit sha>`
on [Docker Hub](https://hub.docker.com/r/ismoilovdevml/gitlab-ci-dashboard/tags). To roll back,
set `image:` of the `app` service in `docker-compose.yml` to the previous tag, restore the backup
taken before the upgrade and run `docker compose up -d`.
