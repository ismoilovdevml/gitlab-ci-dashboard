# Installation

There are three ways to install the dashboard:

- [Installer script](#installer-script): one command, recommended
- [Manual Docker Compose](#manual-docker-compose): the same stack, set up by hand
- [From source](#from-source): build and run without the published image

All three run the same stack from `docker-compose.yml`:

| Service | Image | Exposed | Data |
|---------|-------|---------|------|
| `app` | `ismoilovdevml/gitlab-ci-dashboard:latest` | host port `DASHBOARD_PORT` (default `3000`) | none |
| `postgres` | `postgres:17-alpine` | internal network only | volume `postgres_data` |
| `redis` | `redis:alpine` | internal network only | volume `redis_data` (cache only) |

## Installer script

```bash
curl -fsSL https://raw.githubusercontent.com/ismoilovdevml/gitlab-ci-dashboard/main/scripts/install.sh | bash
```

The installer:

1. checks that Docker, Docker Compose and the Docker daemon are available;
2. downloads `docker-compose.yml` and `.env.example` into the install directory;
3. generates `.env` with random secrets, including `TOKEN_ENCRYPTION_KEY` and
   `GITLAB_WEBHOOK_SECRET` (an existing `.env` is never overwritten);
4. pulls the images and starts PostgreSQL, Redis and the dashboard;
5. waits for the dashboard and prints the URL and the admin credentials.

### Options

Options are environment variables. Put them on the `bash` side of the pipe, not before `curl`:

```bash
curl -fsSL https://raw.githubusercontent.com/ismoilovdevml/gitlab-ci-dashboard/main/scripts/install.sh | DASHBOARD_PORT=8080 INSTALL_DIR=/opt/gitlab-ci-dashboard bash
```

| Variable | Default | Purpose |
|----------|---------|---------|
| `INSTALL_DIR` | `./gitlab-ci-dashboard` | Where the files are installed |
| `DASHBOARD_PORT` | `3000`, or the value in an existing `.env` | Published port: `PORT`, `IPV4:PORT` or `[IPV6]:PORT`, for example `127.0.0.1:3000` |
| `INSTALL_REF` | `main` | Git branch or tag to download the files from |
| `SKIP_START=1` | unset | Only prepare the files; do not check Docker, pull or start |
| `INSTALL_BASE_URL` | `https://raw.githubusercontent.com/ismoilovdevml/gitlab-ci-dashboard/<INSTALL_REF>` | Where the files are downloaded from; only for forks or local testing |

On a server, install into a fixed directory and publish the port on localhost only if a reverse
proxy runs on the same host:

```bash
curl -fsSL https://raw.githubusercontent.com/ismoilovdevml/gitlab-ci-dashboard/main/scripts/install.sh | INSTALL_DIR=/opt/gitlab-ci-dashboard DASHBOARD_PORT=127.0.0.1:3000 bash
```

Run it with `sudo` or as a user in the `docker` group.

### Re-running the installer

Re-running is safe and is also a way to upgrade:

- `.env` is kept as it is;
- `docker-compose.yml` is refreshed; if your copy differs from the new one, it is saved as
  `docker-compose.yml.bak.<timestamp>` first;
- the images are pulled and the stack is updated with `docker compose up -d`.

If an existing `.env` already sets `DASHBOARD_PORT`, that value wins over the one passed to the
installer. Edit `.env` to change it.

## Manual Docker Compose

Use this when you do not want to pipe a script into `bash`. Either clone the repository:

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

Edit `.env` and replace every `CHANGE_ME...` value, for example with the output of
`openssl rand -hex 32`. `ADMIN_PASSWORD` must be at least 12 characters. Uncomment and set
`TOKEN_ENCRYPTION_KEY` as well. All variables are described in [Configuration](./configuration).

Start the stack and follow the app log:

```bash
docker compose up -d
docker compose logs -f app
```

On every start the `app` container:

1. applies pending database migrations (`Running database migrations...`); if a migration fails,
   the container exits instead of starting the app;
2. creates the admin user from `ADMIN_USERNAME` / `ADMIN_PASSWORD` if it does not exist yet;
3. starts the web server on port 3000 inside the container.

If `ADMIN_PASSWORD` is missing, shorter than 12 characters or still starts with `CHANGE_ME`, the
app starts but no admin is created. See
[Troubleshooting](./troubleshooting#no-admin-user-or-cannot-log-in).

## From source

Build the image yourself instead of pulling `ismoilovdevml/gitlab-ci-dashboard:latest`:

```bash
git clone https://github.com/ismoilovdevml/gitlab-ci-dashboard.git
cd gitlab-ci-dashboard
./scripts/generate-env.sh
docker build -t gitlab-ci-dashboard:local .
```

Point the `app` service at the local image, then start the stack:

```yaml
# docker-compose.yml
services:
  app:
    image: gitlab-ci-dashboard:local
```

```bash
docker compose up -d
```

The image is a multi-stage build on `node:24-alpine`; its entrypoint runs the migrations and the
admin seed before the server, exactly as the published image does.

To run the app directly with Node.js (no container for the app), follow the development setup in
[Contributing](./contributing#development-setup) and use `npm run build && npm run start` instead
of `npm run dev`.

## Uninstall

```bash
cd gitlab-ci-dashboard
docker compose down        # stop and remove the containers, keep the data
docker compose down -v     # also delete the database and cache volumes
```
