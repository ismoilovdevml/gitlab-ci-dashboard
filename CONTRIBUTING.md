# Contributing

Thanks for helping improve GitLab CI/CD Dashboard! This project is MIT-licensed and free for everyone.

## Ways to contribute

- **Report a bug** or **request a feature** via [Issues](https://github.com/ismoilovdevml/gitlab-ci-dashboard/issues/new/choose).
- **Pick up work**: issues labelled [`good first issue`](https://github.com/ismoilovdevml/gitlab-ci-dashboard/labels/good%20first%20issue)
  or [`help wanted`](https://github.com/ismoilovdevml/gitlab-ci-dashboard/labels/help%20wanted).
  Comment on the issue so nobody else starts the same thing.
- **Improve docs** — typos and unclear steps are real bugs.

Security issues: see [SECURITY.md](SECURITY.md). Do not open a public issue.

## Development setup

Requirements: Node.js 20+, Docker (for PostgreSQL and Redis).

```bash
git clone https://github.com/<you>/gitlab-ci-dashboard.git
cd gitlab-ci-dashboard
cp .env.example .env              # fill in the required values
docker compose up -d postgres redis
npm install
npm run db:generate && npm run db:migrate
npm run seed                      # creates the admin user from ADMIN_PASSWORD
npm run dev                       # http://localhost:3000
```

## Making a change

1. Branch from `main`: `<type>/<issue#>-<short-slug>` (e.g. `fix/42-pipeline-refresh`).
2. Keep the change focused on one issue. Add or update tests for behaviour you change.
3. Run the checks — CI runs the same ones:
   ```bash
   npm run lint && npm run test && npm run build
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

## Code style

- TypeScript strict; avoid `any`.
- Components in PascalCase (`PipelineCard.tsx`), hooks prefixed with `use`.
- API routes enforce CSRF on state-changing methods and validate input with zod.
- Database access goes through the org-scoped helpers in `src/lib/db/` and `src/lib/org/`.
- Use `src/lib/logger.ts` instead of `console.log`.

## Code of Conduct

By participating you agree to our [Code of Conduct](CODE_OF_CONDUCT.md).
