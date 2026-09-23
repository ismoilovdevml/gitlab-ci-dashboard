#!/bin/sh
# Runs before any container command (compose `command:` overrides CMD, not ENTRYPOINT),
# so installs that keep an older compose file are migrated too.
set -e

cd /app

echo "Running database migrations..."
if ! ./node_modules/.bin/tsx prisma/migrate.ts; then
  echo "ERROR: database migration failed; not starting the app. See the log above." >&2
  exit 1
fi

echo "Creating admin user if missing..."
if ! ./node_modules/.bin/tsx prisma/seed.ts; then
  echo "WARNING: admin user seed failed; starting anyway." >&2
fi

exec "$@"
