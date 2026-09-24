# Troubleshooting

Run the commands in the install directory (the one with `docker-compose.yml`).

## Logs and status

```bash
docker compose ps                 # container state and health
docker compose logs -f app        # dashboard
docker compose logs postgres      # database
docker compose logs redis         # cache
```

## The installer stops early

| Message | Fix |
|---------|-----|
| `Docker is not installed` | Install Docker Engine: <https://docs.docker.com/engine/install/> |
| `Cannot talk to the Docker daemon` | Start Docker, or run as a user in the `docker` group (or with `sudo`) |
| `Docker Compose is not installed` | Install the Compose plugin: <https://docs.docker.com/compose/install/> |
| `DASHBOARD_PORT must be PORT, IPV4:PORT or [IPV6]:PORT` | Use `8080`, `127.0.0.1:8080` or `[::1]:8080` |
| `this installer requires bash` | Pipe into `bash`, not `sh` |
| `Dashboard did not respond within 180s` | The first start can take longer on slow hosts. Watch `docker compose logs -f app` |

## No admin user or cannot log in

The admin is created from `.env` on the first start. If `ADMIN_PASSWORD` is missing, shorter than
12 characters or still starts with `CHANGE_ME`, the app starts but no admin is created. The log
shows:

```text
Seed failed: Error: Cannot create admin user: ADMIN_PASSWORD ...
WARNING: admin user seed failed; starting anyway.
```

Fix `ADMIN_PASSWORD` in `.env` and recreate the container, which retries the admin creation:

```bash
docker compose up -d
docker compose logs app | grep -i admin
```

`ADMIN_PASSWORD` is only used when the admin does not exist yet. Changing it later does not change
an existing admin's password; use **Settings → Change Password** instead.

After five failed logins from one IP within a minute, further attempts are refused for the rest of
that minute.

## The app container keeps restarting

Check the log for `[migrate] ERROR`:

```bash
docker compose logs app | grep -A3 '\[migrate\]'
```

A failed migration stops the container before the app starts. See
[Automatic migrations](./deployment#automatic-migrations). If the log mentions authentication,
`POSTGRES_PASSWORD` in `.env` does not match the password the database volume was created with.

## Connecting to GitLab fails

See the error table in [Connecting GitLab](./connecting-gitlab#common-errors). The most common
causes:

- **Redirect error**: enter the final URL, with `https://` if GitLab redirects to HTTPS and the
  exact path it is served on.
- **Connection failed**: the dashboard container cannot reach GitLab. Test from the container:
  ```bash
  docker compose exec app wget -qO- https://gitlab.example.com/api/v4/version
  ```
  A `401 Unauthorized` answer here means GitLab is reachable.

## GitLab tokens cannot be decrypted after an upgrade

Older installs encrypted GitLab tokens with `LICENSE_ENCRYPTION_KEY`. Current versions use
`TOKEN_ENCRYPTION_KEY`, and the current `docker-compose.yml` does not pass
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
and have to be entered again in **Settings**.

## Webhooks return 401, 404 or 503

- **401**: the secret token in GitLab does not match. For a `?org=<id>` URL it must be that
  organization's secret from **Alerting**; for the plain URL it must equal
  `GITLAB_WEBHOOK_SECRET`. Changing `GITLAB_WEBHOOK_SECRET` changes every organization's secret,
  so update the webhooks in GitLab afterwards.
- **404**: the organization in `?org=` does not exist.
- **503**: `GITLAB_WEBHOOK_SECRET` is not set; per-organization URLs require it. Set it and run
  `docker compose up -d`.

Use **Test** in GitLab's webhook settings and check `docker compose logs app`.

## Alerts are not delivered

1. **Alerting → History** shows every attempt and its error.
2. Check that the channel is turned on, and use **Send Test Message**.
3. Only Slack, Telegram and Discord are delivered; Email and Webhook channels are not yet.
4. In GitLab, **Settings → Webhooks → Recent events** shows whether GitLab reached the dashboard.
5. The webhook URL must be reachable from GitLab; `localhost` URLs are not.

## The webhook URL shows `http://` or the wrong host

The URL is built from the request. Open the dashboard through its public address, and make sure
the reverse proxy passes `Host` and `X-Forwarded-Proto` as in the
[proxy examples](./deployment#reverse-proxy-and-https).

## Port already in use

Set another port in `.env` (`DASHBOARD_PORT=8080`) and run `docker compose up -d`.

## Start over

This deletes all data, including the database:

```bash
docker compose down -v
```
