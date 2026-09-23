/**
 * @jest-environment node
 */
jest.mock('@/lib/db/prisma', () => ({ __esModule: true, default: {} }));
jest.mock('@/lib/logger', () => ({
  logger: { error: jest.fn(), info: jest.fn(), warn: jest.fn(), debug: jest.fn() },
}));

type TokenModule = typeof import('@/lib/gitlab/token');

const ORIGINAL_ENV = process.env;

async function load(env: Record<string, string | undefined>): Promise<{ mod: TokenModule; warn: jest.Mock }> {
  process.env = { ...ORIGINAL_ENV };
  delete process.env.TOKEN_ENCRYPTION_KEY;
  delete process.env.LICENSE_ENCRYPTION_KEY;
  for (const [k, v] of Object.entries(env)) {
    if (v !== undefined) process.env[k] = v;
  }
  jest.resetModules();
  const mod = await import('@/lib/gitlab/token');
  const { logger } = await import('@/lib/logger');
  return { mod, warn: logger.warn as jest.Mock };
}

describe('gitlab token encryption', () => {
  afterAll(() => {
    process.env = ORIGINAL_ENV;
  });

  it('round-trips with TOKEN_ENCRYPTION_KEY and does not warn', async () => {
    const { mod, warn } = await load({ TOKEN_ENCRYPTION_KEY: 'new-key' });
    const stored = mod.encryptToken('glpat-secret');
    expect(stored).toMatch(/^tok:/);
    expect(stored).not.toContain('glpat-secret');
    expect(mod.decryptToken(stored)).toBe('glpat-secret');
    expect(warn).not.toHaveBeenCalled();
  });

  it('decrypts a token encrypted with the legacy LICENSE_ENCRYPTION_KEY', async () => {
    const legacy = await load({ LICENSE_ENCRYPTION_KEY: 'legacy-key' });
    const stored = legacy.mod.encryptToken('glpat-legacy');

    // Fresh module instance, as after an upgrade restart with only the legacy key set.
    const { mod, warn } = await load({ LICENSE_ENCRYPTION_KEY: 'legacy-key' });
    expect(mod.decryptToken(stored)).toBe('glpat-legacy');
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0][0]).toMatch(/LICENSE_ENCRYPTION_KEY is deprecated/);
  });

  it('decrypts a legacy token when TOKEN_ENCRYPTION_KEY is set to the same value', async () => {
    const legacy = await load({ LICENSE_ENCRYPTION_KEY: 'shared-key' });
    const stored = legacy.mod.encryptToken('glpat-migrated');

    const { mod } = await load({ TOKEN_ENCRYPTION_KEY: 'shared-key' });
    expect(mod.decryptToken(stored)).toBe('glpat-migrated');
  });

  it('warns only once per process for the legacy key', async () => {
    const { mod, warn } = await load({ LICENSE_ENCRYPTION_KEY: 'legacy-key' });
    const stored = mod.encryptToken('a');
    mod.decryptToken(stored);
    mod.encryptToken('b');
    expect(warn).toHaveBeenCalledTimes(1);
  });

  it('TOKEN_ENCRYPTION_KEY takes precedence over LICENSE_ENCRYPTION_KEY', async () => {
    const both = await load({ TOKEN_ENCRYPTION_KEY: 'token-key', LICENSE_ENCRYPTION_KEY: 'legacy-key' });
    const stored = both.mod.encryptToken('glpat-precedence');
    expect(both.warn).not.toHaveBeenCalled();

    const tokenOnly = await load({ TOKEN_ENCRYPTION_KEY: 'token-key' });
    expect(tokenOnly.mod.decryptToken(stored)).toBe('glpat-precedence');

    const legacyOnly = await load({ LICENSE_ENCRYPTION_KEY: 'legacy-key' });
    expect(() => legacyOnly.mod.decryptToken(stored)).toThrow();
  });

  it('throws when an encrypted token is read with no key configured', async () => {
    const encrypted = (await load({ TOKEN_ENCRYPTION_KEY: 'k' })).mod.encryptToken('x');
    const { mod } = await load({});
    expect(() => mod.decryptToken(encrypted)).toThrow(/TOKEN_ENCRYPTION_KEY required/);
  });
});
