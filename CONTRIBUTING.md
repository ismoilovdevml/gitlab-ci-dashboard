# Contributing

Thanks for helping improve GitLab CI/CD Dashboard. The project is MIT-licensed and free for everyone.

## Ways to contribute

- **Report a bug** or **request a feature** via [Issues](https://github.com/ismoilovdevml/gitlab-ci-dashboard/issues/new/choose).
- **Pick up work**: issues labelled [`good first issue`](https://github.com/ismoilovdevml/gitlab-ci-dashboard/labels/good%20first%20issue)
  or [`help wanted`](https://github.com/ismoilovdevml/gitlab-ci-dashboard/labels/help%20wanted).
  Comment on the issue so nobody else starts the same thing.
- **Improve the docs** in [`docs/`](docs/). Typos and unclear steps are real bugs.

Security issues: see [SECURITY.md](SECURITY.md). Do not open a public issue.

## Development setup

Requirements: Node.js 20.9 or later (CI and the Docker image use Node.js 24), Docker for
PostgreSQL and Redis, and a GitLab access token to test with.

Start PostgreSQL and Redis with their ports published on localhost (the services in
`docker-compose.yml` are only reachable inside the Compose network):

```bash
git clone https://github.com/<you>/gitlab-ci-dashboard.git
cd gitlab-ci-dashboard
docker run -d --name cidash-postgres -e POSTGRES_USER=gitlab_dashboard -e POSTGRES_PASSWORD=devpassword \
  -e POSTGRES_DB=gitlab_dashboard -p 127.0.0.1:5432:5432 postgres:17-alpine
docker run -d --name cidash-redis -p 127.0.0.1:6379:6379 redis:alpine redis-server --requirepass devpassword
```

Create a `.env` for local development:

```bash
cat > .env <<EOF
DATABASE_URL=postgresql://gitlab_dashboard:devpassword@localhost:5432/gitlab_dashboard?schema=public
REDIS_URL=redis://:devpassword@localhost:6379
SESSION_SECRET=$(openssl rand -hex 32)
TOKEN_ENCRYPTION_KEY=$(openssl rand -hex 32)
GITLAB_WEBHOOK_SECRET=$(openssl rand -hex 32)
ADMIN_USERNAME=admin
ADMIN_PASSWORD=dev-admin-password
EOF
```

Install, migrate, create the admin and start the dev server:

```bash
npm ci
npm run db:generate              # Prisma client
set -a; . ./.env; set +a         # migrate and seed read the environment, not .env
npm run db:migrate
npm run seed                     # creates the admin user from ADMIN_PASSWORD
npm run dev                      # http://localhost:3000
```

Log in as `admin` / `dev-admin-password` and connect a GitLab instance under **Settings**.

## Making a change

1. Branch from `main`: `<type>/<issue#>-<short-slug>` (e.g. `fix/42-pipeline-refresh`).
2. Keep the change focused on one issue. Add or update tests for behaviour you change.
3. Run the checks. CI runs the same ones:
   ```bash
   npm run lint
   npx tsc --noEmit
   npm run test
   npm run build
   ```
4. Commit with [Conventional Commits](https://www.conventionalcommits.org/): `feat:`, `fix:`,
   `docs:`, `refactor:`, `test:`, `chore:`, `ci:`.
5. Open a PR that says `Closes #<issue>` and fill in the template.

## Database changes

The schema is managed with Prisma migrations; containers apply them on startup.

1. Edit `prisma/schema.prisma`.
2. Create a migration: `npx prisma migrate dev --name <short_name>` (needs a local
   Postgres user that can create a shadow database).
3. Commit the new directory under `prisma/migrations/`. Never edit a migration that has
   already been released; add a new one instead.

Do not use `prisma db push` against a database you want to keep.

## Documentation

The documentation site is built with [VitePress](https://vitepress.dev/) from `docs/` and
published to <https://ismoilovdevml.github.io/gitlab-ci-dashboard/> on every push to `main` that
changes `docs/`.

```bash
cd docs
npm ci
npm run docs:dev        # http://localhost:5173/gitlab-ci-dashboard/
npm run docs:build      # fails on dead links
```

Screenshots live in `docs/public/screenshots/` as WebP. Use demo data only, never data from a
real GitLab instance.

## Code style

- TypeScript strict; avoid `any`.
- Components in PascalCase (`PipelineCard.tsx`), hooks prefixed with `use`.
- API routes enforce CSRF on state-changing methods and validate input with zod.
- Database access goes through the org-scoped helpers in `src/lib/db/` and `src/lib/org/`.
- Use `src/lib/logger.ts` instead of `console.log`.

## Code of Conduct

By participating you agree to our [Code of Conduct](CODE_OF_CONDUCT.md).
