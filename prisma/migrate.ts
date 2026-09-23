// Applies database migrations on startup. Run with `tsx prisma/migrate.ts`.
//
// Installs created before migrations existed were built with `prisma db push` and have
// no `_prisma_migrations` history. Those are brought to the frozen pre-migrate schema
// (additive only, never --accept-data-loss), checked for an exact match, and baselined
// as 0_init. After that every database goes through `prisma migrate deploy`.
//
// Lives under prisma/ because the runtime image ships this directory but not src/.

import { spawnSync } from 'child_process';
import path from 'path';

export const BASELINE_MIGRATION = '0_init';
export const STALE_MIGRATIONS = ['20260208_add_organizations'];

const SCHEMA_PATH = path.join(__dirname, 'schema.prisma');
const LEGACY_SCHEMA_PATH = path.join(__dirname, 'legacy', 'pre-migrate.prisma');

export type QueryFn = <T = Record<string, unknown>>(sql: string) => Promise<T[]>;
/** Runs the Prisma CLI with the given arguments and returns its exit code. */
export type PrismaCliFn = (args: string[]) => number;

export interface MigrateDeps {
  query: QueryFn;
  prisma: PrismaCliFn;
  sleep: (ms: number) => Promise<void>;
  log: (message: string) => void;
}

export interface MigrateOptions {
  connectAttempts?: number;
  connectDelayMs?: number;
  schemaPath?: string;
  legacySchemaPath?: string;
}

export class MigrationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'MigrationError';
  }
}

// Retrying cannot fix these: P1000 = authentication failed.
const NON_RETRYABLE_CONNECT_ERRORS = new Set(['P1000']);

function errorCode(error: unknown): string | undefined {
  if (typeof error !== 'object' || error === null) return undefined;
  const { errorCode: initCode, code } = error as { errorCode?: unknown; code?: unknown };
  const value = initCode ?? code;
  return typeof value === 'string' ? value : undefined;
}

/** Flattens a (multi-line) Prisma error into one log line without the call-site preamble. */
export function describeError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  const reason =
    message
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l && !/^Invalid `.*` invocation:?$/.test(l))
      .join(' ') || 'unknown error';
  const code = errorCode(error);
  return code ? `${reason} (${code})` : reason;
}

// With a driver adapter, connection failures arrive as P2010 carrying the adapter's error kind.
function driverErrorKind(error: unknown): string | undefined {
  if (typeof error !== 'object' || error === null) return undefined;
  const meta = (error as { meta?: { driverAdapterError?: { cause?: { kind?: unknown } } } }).meta;
  const kind = meta?.driverAdapterError?.cause?.kind;
  return typeof kind === 'string' ? kind : undefined;
}

function isNonRetryable(error: unknown): boolean {
  const code = errorCode(error);
  if (code && NON_RETRYABLE_CONNECT_ERRORS.has(code)) return true;
  if (driverErrorKind(error) === 'AuthenticationFailed') return true;
  // Connection failures surface as PrismaClientInitializationError without a code.
  const message = error instanceof Error ? error.message : '';
  return message.includes('Authentication failed against database server');
}

export async function waitForDatabase(
  deps: Pick<MigrateDeps, 'query' | 'sleep' | 'log'>,
  attempts = 30,
  delayMs = 1000
): Promise<void> {
  for (let attempt = 1; ; attempt++) {
    try {
      await deps.query('SELECT 1');
      return;
    } catch (error) {
      if (isNonRetryable(error)) {
        throw new MigrationError(`Cannot connect to the database: ${describeError(error)}`);
      }
      if (attempt >= attempts) {
        throw new MigrationError(
          `Database not reachable after ${attempts} attempts: ${describeError(error)}`
        );
      }
      deps.log(`Database not reachable yet (attempt ${attempt}/${attempts}), retrying...`);
      await deps.sleep(delayMs);
    }
  }
}

export interface DatabaseState {
  hasUsersTable: boolean;
  hasMigrationsTable: boolean;
  baselineApplied: boolean;
}

export async function inspectDatabase(query: QueryFn): Promise<DatabaseState> {
  const [tables] = await query<{ has_users: boolean; has_migrations: boolean }>(
    `SELECT
       to_regclass(quote_ident(current_schema()) || '.users') IS NOT NULL AS has_users,
       to_regclass(quote_ident(current_schema()) || '._prisma_migrations') IS NOT NULL AS has_migrations`
  );
  const hasUsersTable = Boolean(tables?.has_users);
  const hasMigrationsTable = Boolean(tables?.has_migrations);

  let baselineApplied = false;
  if (hasMigrationsTable) {
    const [row] = await query<{ n: number }>(
      `SELECT COUNT(*)::int AS n FROM "_prisma_migrations"
       WHERE migration_name = '${BASELINE_MIGRATION}'
         AND finished_at IS NOT NULL
         AND rolled_back_at IS NULL`
    );
    baselineApplied = Number(row?.n ?? 0) > 0;
  }

  return { hasUsersTable, hasMigrationsTable, baselineApplied };
}

/** A database created by `prisma db push` that has not been baselined yet. */
export function isLegacyInstall(state: DatabaseState): boolean {
  return state.hasUsersTable && !state.baselineApplied;
}

function runPrisma(deps: MigrateDeps, args: string[], failure: string): void {
  const code = deps.prisma(args);
  if (code !== 0) {
    throw new MigrationError(`${failure} (prisma ${args[0]} ${args[1] ?? ''} exited with ${code})`);
  }
}

async function baselineLegacyInstall(
  deps: MigrateDeps,
  state: DatabaseState,
  schemaPath: string,
  legacySchemaPath: string
): Promise<void> {
  deps.log('Existing database without migration history found; baselining it.');

  if (state.hasMigrationsTable) {
    const names = STALE_MIGRATIONS.map((n) => `'${n}'`).join(', ');
    await deps.query(`DELETE FROM "_prisma_migrations" WHERE migration_name IN (${names})`);
  }

  // Additive only: without --accept-data-loss Prisma refuses to drop anything.
  runPrisma(
    deps,
    ['db', 'push', '--schema', legacySchemaPath],
    'Could not bring the database to the pre-migrate schema without data loss. ' +
      'Back up the database and see the upgrade notes'
  );

  const diffCode = deps.prisma([
    'migrate',
    'diff',
    '--from-config-datasource',
    '--to-schema',
    legacySchemaPath,
    '--script',
    '--exit-code',
  ]);
  if (diffCode !== 0) {
    throw new MigrationError(
      diffCode === 2
        ? 'Database does not match the pre-migrate schema after db push (differences printed above); ' +
            `not marking ${BASELINE_MIGRATION} as applied`
        : `Could not compare the database with the pre-migrate schema (prisma migrate diff exited with ${diffCode})`
    );
  }

  runPrisma(
    deps,
    ['migrate', 'resolve', '--applied', BASELINE_MIGRATION, '--schema', schemaPath],
    `Could not record ${BASELINE_MIGRATION} as applied`
  );
}

export async function runMigrations(deps: MigrateDeps, options: MigrateOptions = {}): Promise<void> {
  const schemaPath = options.schemaPath ?? SCHEMA_PATH;
  const legacySchemaPath = options.legacySchemaPath ?? LEGACY_SCHEMA_PATH;

  deps.log('Waiting for database...');
  await waitForDatabase(deps, options.connectAttempts, options.connectDelayMs);

  const state = await inspectDatabase(deps.query);
  if (isLegacyInstall(state)) {
    await baselineLegacyInstall(deps, state, schemaPath, legacySchemaPath);
  }

  deps.log('Applying migrations...');
  runPrisma(deps, ['migrate', 'deploy', '--schema', schemaPath], 'Migrations failed');
  deps.log('Database is up to date.');
}

function prismaCli(args: string[]): number {
  const cli = require.resolve('prisma/build/index.js');
  const result = spawnSync(process.execPath, [cli, ...args], {
    // prisma.config.ts (datasource URL, schema) is looked up in the working directory.
    cwd: path.join(__dirname, '..'),
    stdio: 'inherit',
    env: { ...process.env, PRISMA_HIDE_UPDATE_MESSAGE: '1' },
  });
  if (result.error) {
    console.error(`[migrate] Could not start prisma: ${result.error.message}`);
    return 1;
  }
  return result.status ?? 1;
}

async function main(): Promise<void> {
  if (!process.env.DATABASE_URL) {
    throw new MigrationError('DATABASE_URL is not set');
  }

  const { PrismaClient } = await import('@prisma/client');
  const { createPgAdapter } = await import('./adapter');
  const client = new PrismaClient({ adapter: createPgAdapter(), log: [] });
  try {
    await runMigrations({
      query: <T,>(sql: string) => client.$queryRawUnsafe<T[]>(sql),
      prisma: prismaCli,
      sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
      log: (message) => console.log(`[migrate] ${message}`),
    });
  } finally {
    await client.$disconnect().catch(() => undefined);
  }
}

if (require.main === module) {
  main().catch((error: unknown) => {
    const message = error instanceof MigrationError ? error.message : describeError(error);
    console.error(`[migrate] ERROR: ${message}`);
    process.exit(1);
  });
}
