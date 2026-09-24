# Getting started

GitLab CI/CD Dashboard runs as three containers: the Next.js app, PostgreSQL and Redis. It works
with GitLab.com and with self-managed GitLab.

## Requirements

- A Linux or macOS host with Docker Engine and the Docker Compose plugin
  ([install guide](https://docs.docker.com/engine/install/)), and `curl`
- A free port for the dashboard (default `3000`)
- About 2 GB of RAM and 10 GB of disk for a small team
- Network access from the host to your GitLab instance
- A GitLab access token with the `read_api` or `api` scope
  (see [Connecting GitLab](./connecting-gitlab))

## Install

```bash
curl -fsSL https://raw.githubusercontent.com/ismoilovdevml/gitlab-ci-dashboard/main/scripts/install.sh | bash
```

The installer creates `./gitlab-ci-dashboard`, generates `.env` with random secrets, starts the
stack and prints the URL, the admin username and the admin password:

```text
==> Done
  Dashboard URL:  http://localhost:3000
  Username:       admin
  Password:       <generated>
```

The password is also stored in `gitlab-ci-dashboard/.env` as `ADMIN_PASSWORD`. Options such as a
different port or install directory are described in [Installation](./installation).

## Log in

Open the URL and sign in with the admin username and password.

![Login page](/screenshots/login.webp){.screenshot}

## Connect GitLab

1. Create an access token in GitLab under **User settings → Access tokens** with the `read_api`
   scope (or `api` if you want to retry, cancel and delete from the dashboard).
2. In the dashboard, open **Settings**, enter your GitLab URL (for example
   `https://gitlab.com` or `https://gitlab.example.com`) and the token.
3. Click **Test & Save**. The server calls GitLab with the token and saves it only if the call
   succeeds.

The sidebar then shows **Connected to GitLab** and the **Overview** page fills with your
pipelines. Details and common errors: [Connecting GitLab](./connecting-gitlab).

## Next steps

- Put the dashboard behind HTTPS: [Deployment](./deployment#reverse-proxy-and-https)
- Get alerts in Slack, Telegram or Discord: [Alerting and webhooks](/features/alerting)
- Schedule backups: [Deployment → Backups](./deployment#backups)
