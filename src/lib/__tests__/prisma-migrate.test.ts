/**
 * @jest-environment node
 */
import {
  BASELINE_MIGRATION,
  MigrationError,
  describeError,
  inspectDatabase,
  isLegacyInstall,
  runMigrations,
  waitForDatabase,
  type MigrateDeps,
} from '../../../prisma/migrate';

interface FakeDb {
  reachableAfter?: number;
  hasUsers: boolean;
  hasMigrations: boolean;
  baselineApplied: boolean;
}

function makeDeps(db: FakeDb, cliCodes: Record<string, number> = {}) {
  let connectCalls = 0;
  const queries: string[] = [];
  const cliCalls: string[][] = [];

  const query = jest.fn(async (sql: string) => {
    queries.push(sql);
    if (sql === 'SELECT 1') {
      connectCalls++;
      if (connectCalls < (db.reachableAfter ?? 1)) {
        throw new Error("Can't reach database server at `db:5432`");
      }
      return [{ '?column?': 1 }];
    }
    if (sql.includes('to_regclass')) {
      return [{ has_users: db.hasUsers, has_migrations: db.hasMigrations }];
    }
    if (sql.includes('COUNT(*)')) {
      return [{ n: db.baselineApplied ? 1 : 0 }];
    }
    return [];
  });

  const prisma = jest.fn((args: string[]) => {
    cliCalls.push(args);
    return cliCodes[`${args[0]} ${args[1]}`] ?? 0;
  });

  const deps: MigrateDeps = {
    query: query as unknown as MigrateDeps['query'],
    prisma,
    sleep: jest.fn(async () => undefined),
    log: jest.fn(),
  };
  return { deps, queries, cliCalls };
}

const opts = { schemaPath: 'schema.prisma', legacySchemaPath: 'legacy.prisma', connectAttempts: 3 };
const commands = (calls: string[][]) => calls.map((c) => `${c[0]} ${c[1]}`);

describe('isLegacyInstall', () => {
  it('is true only when app tables exist without a finished baseline', () => {
    expect(isLegacyInstall({ hasUsersTable: true, hasMigrationsTable: false, baselineApplied: false })).toBe(true);
    expect(isLegacyInstall({ hasUsersTable: true, hasMigrationsTable: true, baselineApplied: false })).toBe(true);
    expect(isLegacyInstall({ hasUsersTable: true, hasMigrationsTable: true, baselineApplied: true })).toBe(false);
    expect(isLegacyInstall({ hasUsersTable: false, hasMigrationsTable: false, baselineApplied: false })).toBe(false);
  });
});

describe('inspectDatabase', () => {
  it('skips the history query when _prisma_migrations does not exist', async () => {
    const { deps, queries } = makeDeps({ hasUsers: true, hasMigrations: false, baselineApplied: false });
    await expect(inspectDatabase(deps.query)).resolves.toEqual({
      hasUsersTable: true,
      hasMigrationsTable: false,
      baselineApplied: false,
    });
    expect(queries.some((q) => q.includes('COUNT(*)'))).toBe(false);
  });

  it('only counts a finished, not rolled back baseline', async () => {
    const { deps, queries } = makeDeps({ hasUsers: true, hasMigrations: true, baselineApplied: true });
    await expect(inspectDatabase(deps.query)).resolves.toMatchObject({ baselineApplied: true });
    const history = queries.find((q) => q.includes('COUNT(*)'))!;
    expect(history).toContain(`migration_name = '${BASELINE_MIGRATION}'`);
    expect(history).toContain('finished_at IS NOT NULL');
    expect(history).toContain('rolled_back_at IS NULL');
  });
});

describe('waitForDatabase', () => {
  it('retries until the database answers', async () => {
    const { deps } = makeDeps({ reachableAfter: 3, hasUsers: false, hasMigrations: false, baselineApplied: false });
    await waitForDatabase(deps, 5, 10);
    expect(deps.sleep).toHaveBeenCalledTimes(2);
    expect(deps.sleep).toHaveBeenCalledWith(10);
  });

  it('gives up with a clear error after the last attempt', async () => {
    const { deps } = makeDeps({ reachableAfter: 99, hasUsers: false, hasMigrations: false, baselineApplied: false });
    await expect(waitForDatabase(deps, 3, 10)).rejects.toThrow(
      /Database not reachable after 3 attempts: Can't reach database server/
    );
    expect(deps.sleep).toHaveBeenCalledTimes(2);
  });

  // Message as thrown by PrismaClient 6 for a wrong password (no errorCode is set).
  const authError = Object.assign(
    new Error(
      '\nInvalid `prisma.$queryRawUnsafe()` invocation:\n\n\nAuthentication failed against database server, ' +
        'the provided database credentials for `postgres` are not valid.\n\n' +
        'Please make sure to provide valid database credentials for the database server at the configured address.'
    ),
    { name: 'PrismaClientInitializationError' }
  );

  // Shape thrown by PrismaClient 7 with @prisma/adapter-pg for a wrong password.
  const adapterAuthError = Object.assign(
    new Error(
      '\nInvalid `prisma.$queryRawUnsafe()` invocation:\n\n\nRaw query failed. Code: `28P01`. ' +
        'Message: `password authentication failed for user "gcd"`'
    ),
    {
      name: 'PrismaClientKnownRequestError',
      code: 'P2010',
      meta: {
        driverAdapterError: {
          name: 'DriverAdapterError',
          cause: { originalCode: '28P01', kind: 'AuthenticationFailed', user: 'gcd' },
        },
      },
    }
  );

  it.each([
    ['message', authError],
    ['error code', Object.assign(new Error('auth'), { errorCode: 'P1000' })],
    ['driver adapter error kind', adapterAuthError],
  ])('fails immediately on authentication errors (detected by %s)', async (_label, error) => {
    const deps = {
      query: jest.fn().mockRejectedValue(error) as unknown as MigrateDeps['query'],
      sleep: jest.fn(async () => undefined),
      log: jest.fn(),
    };
    await expect(waitForDatabase(deps, 30, 10)).rejects.toThrow(/^Cannot connect to the database: /);
    expect(deps.query).toHaveBeenCalledTimes(1);
    expect(deps.sleep).not.toHaveBeenCalled();
  });

  it('keeps retrying when the driver adapter reports the server as unreachable', async () => {
    const unreachable = Object.assign(new Error("Raw query failed. Code: `N/A`. Message: `Can't reach database server`"), {
      code: 'P2010',
      meta: { driverAdapterError: { cause: { kind: 'DatabaseNotReachable', host: 'db', port: 5432 } } },
    });
    const deps = {
      query: jest
        .fn()
        .mockRejectedValueOnce(unreachable)
        .mockResolvedValue([{ '?column?': 1 }]) as unknown as MigrateDeps['query'],
      sleep: jest.fn(async () => undefined),
      log: jest.fn(),
    };
    await waitForDatabase(deps, 30, 10);
    expect(deps.query).toHaveBeenCalledTimes(2);
    expect(deps.sleep).toHaveBeenCalledTimes(1);
  });
});

describe('describeError', () => {
  it('drops the Prisma call-site preamble and joins the reason into one line', () => {
    const error = new Error(
      "\nInvalid `prisma.$queryRawUnsafe()` invocation:\n\n\nCan't reach database server at `db:5432`\n\n" +
        'Please make sure your database server is running at `db:5432`.'
    );
    expect(describeError(error)).toBe(
      "Can't reach database server at `db:5432` Please make sure your database server is running at `db:5432`."
    );
  });

  it('appends an error code when present', () => {
    expect(describeError(Object.assign(new Error('boom'), { errorCode: 'P1001' }))).toBe('boom (P1001)');
  });

  it('handles non-Error values', () => {
    expect(describeError('boom')).toBe('boom');
    expect(describeError(new Error(''))).toBe('unknown error');
  });
});

describe('runMigrations', () => {
  it('fresh database: only runs migrate deploy', async () => {
    const { deps, cliCalls } = makeDeps({ hasUsers: false, hasMigrations: false, baselineApplied: false });
    await runMigrations(deps, opts);
    expect(cliCalls).toEqual([['migrate', 'deploy', '--schema', 'schema.prisma']]);
  });

  it('already baselined database: only runs migrate deploy', async () => {
    const { deps, cliCalls, queries } = makeDeps({ hasUsers: true, hasMigrations: true, baselineApplied: true });
    await runMigrations(deps, opts);
    expect(commands(cliCalls)).toEqual(['migrate deploy']);
    expect(queries.some((q) => q.startsWith('DELETE'))).toBe(false);
  });

  it('legacy db push install: pushes the baseline without data loss, verifies, resolves, deploys', async () => {
    const { deps, cliCalls, queries } = makeDeps({ hasUsers: true, hasMigrations: false, baselineApplied: false });
    await runMigrations(deps, opts);

    expect(cliCalls).toEqual([
      ['db', 'push', '--schema', 'legacy.prisma'],
      ['migrate', 'diff', '--from-config-datasource', '--to-schema', 'legacy.prisma', '--script', '--exit-code'],
      ['migrate', 'resolve', '--applied', BASELINE_MIGRATION, '--schema', 'schema.prisma'],
      ['migrate', 'deploy', '--schema', 'schema.prisma'],
    ]);
    expect(cliCalls.flat()).not.toContain('--accept-data-loss');
    // No history table yet, so nothing to clean up.
    expect(queries.some((q) => q.startsWith('DELETE'))).toBe(false);
  });

  it('legacy install with a history table: removes the stale organizations migration row', async () => {
    const { deps, queries } = makeDeps({ hasUsers: true, hasMigrations: true, baselineApplied: false });
    await runMigrations(deps, opts);
    expect(queries).toContain(
      `DELETE FROM "_prisma_migrations" WHERE migration_name IN ('20260208_add_organizations')`
    );
  });

  it('stops before resolve when the baseline push fails', async () => {
    const { deps, cliCalls } = makeDeps(
      { hasUsers: true, hasMigrations: false, baselineApplied: false },
      { 'db push': 1 }
    );
    await expect(runMigrations(deps, opts)).rejects.toThrow(/without data loss/);
    expect(commands(cliCalls)).toEqual(['db push']);
  });

  it('stops before resolve when the database still differs from the baseline', async () => {
    const { deps, cliCalls } = makeDeps(
      { hasUsers: true, hasMigrations: false, baselineApplied: false },
      { 'migrate diff': 2 }
    );
    await expect(runMigrations(deps, opts)).rejects.toThrow(/does not match the pre-migrate schema/);
    expect(commands(cliCalls)).toEqual(['db push', 'migrate diff']);
  });

  it('reports a diff tool error separately from a schema mismatch', async () => {
    const { deps } = makeDeps(
      { hasUsers: true, hasMigrations: false, baselineApplied: false },
      { 'migrate diff': 1 }
    );
    await expect(runMigrations(deps, opts)).rejects.toThrow(/Could not compare/);
  });

  it('fails with MigrationError when migrate deploy fails', async () => {
    const { deps } = makeDeps(
      { hasUsers: false, hasMigrations: false, baselineApplied: false },
      { 'migrate deploy': 1 }
    );
    const run = runMigrations(deps, opts);
    await expect(run).rejects.toBeInstanceOf(MigrationError);
    await expect(runMigrations(deps, opts)).rejects.toThrow(/Migrations failed/);
  });

  it('does not touch the schema when the database is unreachable', async () => {
    const { deps, cliCalls } = makeDeps({
      reachableAfter: 99,
      hasUsers: false,
      hasMigrations: false,
      baselineApplied: false,
    });
    await expect(runMigrations(deps, opts)).rejects.toThrow(/not reachable after 3 attempts/);
    expect(cliCalls).toEqual([]);
  });
});
