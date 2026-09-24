# Security

Report vulnerabilities privately through
[GitHub Security Advisories](https://github.com/ismoilovdevml/gitlab-ci-dashboard/security/advisories/new),
not in a public issue. The full policy is in
[SECURITY.md](https://github.com/ismoilovdevml/gitlab-ci-dashboard/blob/main/SECURITY.md).

## What is stored

Everything lives in the PostgreSQL database of your install. Nothing is sent to a third party,
except that the dashboard checks the latest release on the GitHub API to show an update notice.

| Data | Where | Protection |
|------|-------|------------|
| User passwords | `users` | bcrypt hash |
| Sessions | `sessions` | Random token in an `HttpOnly`, `SameSite=Lax` cookie, `Secure` over HTTPS; expire after 7 days |
| GitLab URL and access token | `users` | Token encrypted with AES-256-GCM using `TOKEN_ENCRYPTION_KEY`; plain text if the key is not set |
| Alert channel settings (bot tokens, webhook URLs) | `alert_channels` | Not encrypted at rest; never returned to the browser, only masked |
| Alert history, DORA data, preferences | their tables | Organization-scoped |

Redis holds only caches and rate-limit counters.

## Secrets in `.env`

| Secret | Used for |
|--------|----------|
| `SESSION_SECRET` | Signing CSRF tokens |
| `TOKEN_ENCRYPTION_KEY` | Encrypting stored GitLab tokens |
| `GITLAB_WEBHOOK_SECRET` | Authenticating GitLab webhooks and deriving per-organization webhook secrets |
| `POSTGRES_PASSWORD`, `REDIS_PASSWORD` | Database and cache access on the internal Docker network |
| `ADMIN_PASSWORD` | The first admin's password, used once |

Use long random values (`openssl rand -hex 32`); the installer generates them. See
[Configuration](./configuration#security).

## How the GitLab token is protected

- The browser never receives the token. It calls the dashboard's proxy at `/api/gitlab/v4/...`,
  and the server adds the token.
- The proxy forwards only an allowlist of GitLab API endpoints and query parameters that the
  dashboard uses, so a logged-in session cannot use the token for arbitrary API calls.
- Redirects from GitLab are not followed, so the token only goes to the configured GitLab origin.
  For artifact downloads that redirect to object storage, the token is dropped when the request
  leaves that origin.
- The token is not logged, and the API returns only whether one is configured.

CI builds the app with a fake token and fails if it appears in the client bundle.

## Requests and sessions

- Every state-changing request of a logged-in session needs a CSRF token bound to that session
  (GitLab webhooks are authenticated by their secret token instead).
- Login is rate-limited to 5 attempts per minute per client IP.
- Settings, channel and GitLab connection requests are validated on the server.
- Data access is scoped to the caller's organization.

## Recommendations

- Serve the dashboard over HTTPS; see [Deployment](./deployment#reverse-proxy-and-https).
- Publish it on `127.0.0.1` behind the proxy, or restrict the port with a network firewall.
- Use a GitLab token with the smallest scope you need (`read_api` for monitoring) and an expiry
  date.
- Set `TOKEN_ENCRYPTION_KEY` and `GITLAB_WEBHOOK_SECRET`.
- Keep `.env` and backups private.
- Upgrade regularly; only the latest release gets security fixes.
