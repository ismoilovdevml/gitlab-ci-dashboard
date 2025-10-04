#!/bin/sh
set -e

echo "🔍 Checking database connection..."

# Wait for postgres to be ready
until nc -z postgres 5432 > /dev/null 2>&1; do
  echo "⏳ Waiting for database..."
  sleep 2
done

echo "✅ Database is ready!"

echo "🔄 Running database migrations..."
npx prisma db push --skip-generate

echo "🚀 Starting Next.js application..."
exec node server.js
