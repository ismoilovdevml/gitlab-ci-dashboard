# Connecting GitLab

Each user connects the dashboard to GitLab under **Settings → GitLab Configuration** with a GitLab
URL and an access token. The dashboard works with GitLab.com and self-managed GitLab, including
instances on a private network.

## Create an access token

In GitLab, open **User settings → Access tokens** and create a personal access token. A group or
project access token also works; the dashboard then sees only what that token can see.

| Scope | What works |
|-------|------------|
| `read_api` | Everything read-only: pipelines, jobs, logs, projects, runners, artifacts, registry, analytics |
| `api` | Additionally: retry and cancel pipelines and jobs, run manual jobs, delete artifacts, delete registry tags and repositories, star and unstar projects |

Use `read_api` if you only need monitoring. Set an expiry date that fits your rotation policy;
when the token expires, the dashboard shows an error until you enter a new one.

The **Runners** page lists all runners of the instance only when the token belongs to a GitLab
administrator. Otherwise it shows the runners assigned to your projects.

## Enter the URL and token

1. Open **Settings**.
2. **GitLab URL**: the address of your GitLab, for example `https://gitlab.com` or
   `https://gitlab.example.com`. A GitLab under a relative path such as
   `https://example.com/gitlab` works too.
3. **Access Token**: paste the token.
4. Click **Test & Save**.

![GitLab configuration in Settings](/screenshots/settings.webp){.screenshot}

The dashboard server calls `GET /api/v4/user` on that GitLab with the token. Only if the call
succeeds are the URL and token saved. The sidebar then shows **Connected to GitLab**.

To change the URL later without re-entering the token, leave the token field blank. This is only
allowed for the same GitLab host; a different host requires the token again, so a stored token is
never sent to another server.

### The URL must be the final one

The dashboard does not follow redirects from GitLab, so the token is never sent anywhere other
than the URL you entered. A URL that redirects fails with:

```text
GitLab redirected the request — use the final GitLab URL (check http vs https and the path)
```

Use `https://` if GitLab redirects HTTP to HTTPS, and the exact host and path GitLab is served on.
The URL must not contain a username, password, query string or fragment.

## Where the token goes

The token stays on the server:

- It is stored in PostgreSQL, encrypted with `TOKEN_ENCRYPTION_KEY` (AES-256-GCM) when that key
  is set.
- It is never returned by the API. The settings page only shows that a token is saved.
- The browser never talks to GitLab directly. It calls the dashboard's proxy under
  `/api/gitlab/v4/...`; the server adds the token and forwards the request.
- The proxy forwards only the GitLab API endpoints the dashboard uses (an allowlist of
  26 routes) and only known query parameters. Anything else is rejected.

Artifact downloads also go through the server. When GitLab answers with a redirect to object
storage, the server follows it but sends the token only to the configured GitLab origin.

More on what is stored and how: [Security](./security).

## Common errors

| Message | Cause |
|---------|-------|
| `Invalid token` | GitLab returned `401`: wrong, revoked or expired token |
| `GitLab returned status 403` | The token lacks the `read_api` or `api` scope, or the user is blocked |
| `Connection failed — check the URL` | The dashboard server cannot reach GitLab: DNS, firewall, proxy or TLS problem |
| `GitLab redirected the request ...` | See [The URL must be the final one](#the-url-must-be-the-final-one) |
| `Enter an access token for this GitLab URL` | You changed the host and left the token blank |
| `Stored GitLab token could not be read. Re-enter the token.` | `TOKEN_ENCRYPTION_KEY` changed or was removed; see [Troubleshooting](./troubleshooting#gitlab-tokens-cannot-be-decrypted-after-an-upgrade) |

The connection test runs on the server, so "reachable" means reachable from the dashboard host
(or container), not from your browser.
