# Security Policy

## Reporting a vulnerability

Please **do not** open a public issue for security problems.

Report privately via [GitHub Security Advisories](https://github.com/ismoilovdevml/gitlab-ci-dashboard/security/advisories/new).
Include the affected version, steps to reproduce, and the impact you observed.

You can expect an acknowledgement within 7 days. Once a fix is released, we will credit you in the
advisory unless you prefer to stay anonymous.

## Supported versions

Only the latest release receives security fixes. Please upgrade before reporting.

## Scope notes for self-hosters

- Always set strong, unique values for `SESSION_SECRET`, `ADMIN_PASSWORD`, `POSTGRES_PASSWORD`,
  `REDIS_PASSWORD` and `TOKEN_ENCRYPTION_KEY`.
- Use a GitLab access token with the minimum scopes you need (`read_api` for read-only dashboards).
- Put the dashboard behind HTTPS when it is reachable from outside your network.
