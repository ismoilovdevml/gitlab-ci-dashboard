import { existsSync } from 'node:fs';
import { defineConfig } from 'prisma/config';

// The Prisma CLI no longer reads .env on its own; load it for local `prisma` commands.
// Variables already set in the environment take precedence.
if (existsSync('.env')) process.loadEnvFile('.env');

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: { path: 'prisma/migrations' },
  // Not env('DATABASE_URL'): that throws when unset, and `prisma generate` runs without a database.
  datasource: { url: process.env.DATABASE_URL },
});
