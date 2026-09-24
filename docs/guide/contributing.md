# Contributing

Contributions are welcome: bug reports, fixes, features and documentation. The full guide,
including the pull request process and database migrations, is
[CONTRIBUTING.md](https://github.com/ismoilovdevml/gitlab-ci-dashboard/blob/main/CONTRIBUTING.md).

- **Issues**: [open issues](https://github.com/ismoilovdevml/gitlab-ci-dashboard/issues), including
  [`good first issue`](https://github.com/ismoilovdevml/gitlab-ci-dashboard/labels/good%20first%20issue)
  and [`help wanted`](https://github.com/ismoilovdevml/gitlab-ci-dashboard/labels/help%20wanted).
- **Security problems**: report privately, see [Security](./security).

## Development setup

Requirements: Node.js 20.9 or later (CI and the Docker image use Node.js 24) and Docker.

```bash
git clone https://github.com/<you>/gitlab-ci-dashboard.git
cd gitlab-ci-dashboard

# PostgreSQL and Redis, published on localhost
docker run -d --name cidash-postgres -e POSTGRES_USER=gitlab_dashboard -e POSTGRES_PASSWORD=devpassword \
  -e POSTGRES_DB=gitlab_dashboard -p 127.0.0.1:5432:5432 postgres:17-alpine
docker run -d --name cidash-redis -p 127.0.0.1:6379:6379 redis:alpine redis-server --requirepass devpassword

# Local configuration
cat > .env <<EOF
DATABASE_URL=postgresql://gitlab_dashboard:devpassword@localhost:5432/gitlab_dashboard?schema=public
REDIS_URL=redis://:devpassword@localhost:6379
SESSION_SECRET=$(openssl rand -hex 32)
TOKEN_ENCRYPTION_KEY=$(openssl rand -hex 32)
GITLAB_WEBHOOK_SECRET=$(openssl rand -hex 32)
ADMIN_USERNAME=admin
ADMIN_PASSWORD=dev-admin-password
EOF

npm ci
npm run db:generate              # Prisma client
set -a; . ./.env; set +a         # migrate and seed read the environment, not .env
npm run db:migrate
npm run seed                     # creates the admin user
npm run dev                      # http://localhost:3000
```

Log in as `admin` / `dev-admin-password` and connect a GitLab instance under **Settings**.

## Scripts

| Command | What it does |
|---------|--------------|
| `npm run dev` | Development server with hot reload on port 3000 |
| `npm run build` | Generates the Prisma client and builds the production app |
| `npm run start` | Starts the built app |
| `npm run lint` | ESLint |
| `npm run test` | Jest unit and component tests |
| `npm run test:coverage` | Tests with a coverage report |
| `npm run db:generate` | Generates the Prisma client |
| `npm run db:migrate` | Applies pending migrations (the same script the container runs on start) |
| `npm run seed` | Creates the admin user from `ADMIN_USERNAME` / `ADMIN_PASSWORD` if missing |
| `npm run check:bundle` | Builds with a canary token and fails if it reaches the client bundle |

## Before opening a pull request

Run the same checks as CI:

```bash
npm run lint
npx tsc --noEmit
npm run test
npm run build
```

Use a branch named `<type>/<issue#>-<short-slug>`,
[Conventional Commits](https://www.conventionalcommits.org/), and `Closes #<issue>` in the pull
request description.

## Working on these docs

The site is built with [VitePress](https://vitepress.dev/) from `docs/` and deployed to GitHub
Pages when a change to `docs/` lands on `main`.

```bash
cd docs
npm ci
npm run docs:dev        # http://localhost:5173/gitlab-ci-dashboard/
npm run docs:build      # production build, fails on dead links
npm run docs:preview    # serve the production build
```

Every page has an **Edit this page on GitHub** link at the bottom. Screenshots are in
`docs/public/screenshots/` as WebP and must show demo data only.
