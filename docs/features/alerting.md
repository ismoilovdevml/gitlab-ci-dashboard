# Alerting and webhooks

The dashboard sends alerts when GitLab calls its webhook endpoint. There is no polling: GitLab
pushes an event, the dashboard formats it and forwards it to every enabled channel.

```text
GitLab project ──webhook──▶ /api/webhook/gitlab ──▶ Slack / Telegram / Discord
                                                 └─▶ alert history
```

Setup has three steps: add a channel, copy the webhook URL and secret, add the webhook in GitLab.

## 1. Add a channel

Open **Alerting → Channels**, pick a channel, fill in its settings, turn it on and click
**Save Configuration**. **Send Test Message** sends a test from the server with the saved settings.

![Alert channels](/screenshots/alert-channels.webp){.screenshot}

| Channel | Settings | Delivered |
|---------|----------|-----------|
| Telegram | Bot token (from [@BotFather](https://t.me/BotFather)) and chat ID (a number, or `@channelname`) | yes |
| Slack | [Incoming webhook](https://api.slack.com/messaging/webhooks) URL, optional channel | yes |
| Discord | [Channel webhook](https://support.discord.com/hc/en-us/articles/228383668) URL | yes |
| Email, Webhook | can be saved | not yet |

Secrets (bot token, webhook URLs) are never shown again after saving; the form shows a mask such
as `***2345`. Leave the field blank to keep the stored value. Changing the Telegram chat ID
requires entering the bot token again, so a stored token cannot be redirected to another chat.

Only organization admins (or the install admin) can change channels.

## 2. Copy the webhook URL and secret

Open **Alerting → Webhook Setup**. It shows the URL and the secret token to paste into GitLab.

![Webhook setup](/screenshots/webhook-setup.webp){.screenshot}

Webhooks need `GITLAB_WEBHOOK_SECRET` in `.env`. The installer generates it; on a manual install
set it yourself (`openssl rand -hex 32`) and run `docker compose up -d`. Without it this page
shows an error instead of a URL.

What you see depends on your account:

- **Member of an organization** (owner or admin role): a per-organization URL and secret.
  - URL: `https://<your-dashboard-host>/api/webhook/gitlab?org=<organization id>`
  - Secret token: derived from `GITLAB_WEBHOOK_SECRET` for that organization (HMAC-SHA256), so
    one organization's secret does not reveal another's. Only that organization's channels are
    notified.
- **Install admin without an organization** (the default for a fresh install): the install-wide
  URL `https://<your-dashboard-host>/api/webhook/gitlab`, with `GITLAB_WEBHOOK_SECRET` itself as
  the secret token. It notifies channels without an organization and, when the install has at
  most one organization, that organization's channels too.

With more than one organization, use the per-organization URLs: the install-wide URL then only
reaches channels without an organization.

The URL is built from the address the dashboard is opened with. Behind a reverse proxy it uses
`X-Forwarded-Proto` and `X-Forwarded-Host` or `Host`, so open the dashboard through its public
HTTPS address before copying the URL. GitLab must be able to reach that URL; `localhost` does not
work.

## 3. Add the webhook in GitLab

In the GitLab project:

1. **Settings → Webhooks → Add new webhook**.
2. **URL**: the webhook URL from the dashboard.
3. **Secret token**: the secret token from the dashboard. GitLab sends it in the `X-Gitlab-Token`
   header.
4. **Trigger**: select **Pipeline events**, and **Job events** if you want per-job alerts.
5. Save, then use **Test → Pipeline events**.

Every event GitLab sends is forwarded to all enabled channels, so choose the triggers in GitLab to
control what you get. Accepted events: pipeline, job, push, tag push, merge request, issue, wiki
page, deployment and release.

## Alert history

**Alerting → History** records every delivery attempt: project, pipeline, event type, channel,
whether it was delivered and the error if not.

![Alert history](/screenshots/alert-history.webp){.screenshot}

- Totals, success rate, per-channel statistics and the most active projects for the last 30 days
- Filters by status, channel, date range and text
- Export as CSV or JSON
- Delete single entries or clear the history

Channels of type Email or Webhook are skipped without a history entry.

## Webhook responses

| Status | Meaning |
|--------|---------|
| `200` | Accepted (also when no channel is enabled) |
| `400` | The `org` parameter is malformed |
| `401` | The secret token does not match. For a `?org=` URL it must be that organization's secret; for the install-wide URL it must equal `GITLAB_WEBHOOK_SECRET` |
| `404` | The organization in `?org=` does not exist |
| `503` | `GITLAB_WEBHOOK_SECRET` is not set; per-organization URLs require it |

Changing `GITLAB_WEBHOOK_SECRET` changes every organization's secret. Update the webhooks in
GitLab afterwards.
