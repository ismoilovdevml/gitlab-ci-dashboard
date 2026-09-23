// PostgreSQL driver adapter shared by the app, prisma/migrate.ts and prisma/seed.ts.
// Lives under prisma/ because the runtime image ships this directory but not src/.

import { PrismaPg } from '@prisma/adapter-pg';

// Prisma 6 used a 5s connect timeout; pg waits forever by default.
export const CONNECT_TIMEOUT_MS = 5_000;

/**
 * Reads the `?schema=` parameter of a Prisma connection URL. pg ignores it, so it has
 * to be passed to the adapter explicitly for non-public schemas to keep working.
 */
export function schemaFromUrl(databaseUrl: string | undefined): string | undefined {
  if (!databaseUrl) return undefined;
  try {
    return new URL(databaseUrl).searchParams.get('schema') || undefined;
  } catch {
    return undefined;
  }
}

export function createPgAdapter(databaseUrl: string | undefined = process.env.DATABASE_URL): PrismaPg {
  const schema = schemaFromUrl(databaseUrl);
  return new PrismaPg(
    { connectionString: databaseUrl, connectionTimeoutMillis: CONNECT_TIMEOUT_MS },
    schema ? { schema } : undefined
  );
}
