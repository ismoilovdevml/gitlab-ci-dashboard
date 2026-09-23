/**
 * @jest-environment node
 */
import prisma from '@/lib/db/prisma';
import { GitLabConfigNotFoundError, decryptToken, storeOrgGitLabToken } from '@/lib/gitlab/token';

type Config = { id: string; organizationId: string | null; url: string; token: string };
type Where = { id: string; organizationId: string };

// In-memory table that honours the where clause, so an update that ignores
// organizationId would modify another org's row and fail the test.
const mockConfigs: Config[] = [];

function mockMatches(c: Config, where: Where): boolean {
  return c.id === where.id && c.organizationId === where.organizationId;
}

jest.mock('@/lib/db/prisma', () => ({
  __esModule: true,
  default: {
    gitLabConfig: {
      updateMany: jest.fn(
        async ({ where, data }: { where: Where; data: Partial<Config> }) => {
          const rows = mockConfigs.filter((c) => mockMatches(c, where));
          rows.forEach((c) => Object.assign(c, data));
          return { count: rows.length };
        }
      ),
      findFirst: jest.fn(
        async ({ where }: { where: Where }) =>
          mockConfigs.find((c) => mockMatches(c, where)) ?? null
      ),
      update: jest.fn(),
      create: jest.fn(async ({ data }: { data: Omit<Config, 'id'> }) => ({ id: 'new', ...data })),
    },
  },
}));

const ORG_A = 'org-a';
const ORG_B = 'org-b';

describe('storeOrgGitLabToken', () => {
  const originalKey = process.env.TOKEN_ENCRYPTION_KEY;

  beforeAll(() => {
    process.env.TOKEN_ENCRYPTION_KEY = 'test-token-key';
  });

  afterAll(() => {
    if (originalKey === undefined) delete process.env.TOKEN_ENCRYPTION_KEY;
    else process.env.TOKEN_ENCRYPTION_KEY = originalKey;
  });

  beforeEach(() => {
    jest.clearAllMocks();
    mockConfigs.length = 0;
    mockConfigs.push(
      { id: 'cfg-a', organizationId: ORG_A, url: 'https://a.example.com', token: 'tok-a' },
      { id: 'cfg-b', organizationId: ORG_B, url: 'https://b.example.com', token: 'tok-b' }
    );
  });

  it("updates the caller's own config and encrypts the token", async () => {
    const result = await storeOrgGitLabToken({
      organizationId: ORG_A,
      configId: 'cfg-a',
      url: 'https://a2.example.com',
      token: 'glpat-new',
    });

    expect(result.id).toBe('cfg-a');
    expect(result.url).toBe('https://a2.example.com');
    expect(result.token).not.toContain('glpat-new');
    expect(decryptToken(result.token)).toBe('glpat-new');
    expect(prisma.gitLabConfig.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'cfg-a', organizationId: ORG_A } })
    );
  });

  it("throws not-found for another org's config and leaves it unchanged", async () => {
    await expect(
      storeOrgGitLabToken({
        organizationId: ORG_A,
        configId: 'cfg-b',
        url: 'https://evil.example.com',
        token: 'glpat-evil',
      })
    ).rejects.toBeInstanceOf(GitLabConfigNotFoundError);

    expect(mockConfigs.find((c) => c.id === 'cfg-b')).toEqual({
      id: 'cfg-b',
      organizationId: ORG_B,
      url: 'https://b.example.com',
      token: 'tok-b',
    });
    expect(prisma.gitLabConfig.update).not.toHaveBeenCalled();
    expect(prisma.gitLabConfig.create).not.toHaveBeenCalled();
  });

  it('throws not-found for an unknown config id', async () => {
    await expect(
      storeOrgGitLabToken({
        organizationId: ORG_A,
        configId: 'missing',
        url: 'https://a.example.com',
        token: 'glpat-x',
      })
    ).rejects.toBeInstanceOf(GitLabConfigNotFoundError);
  });

  it('creates a config in the caller org when no id is given', async () => {
    const result = await storeOrgGitLabToken({
      organizationId: ORG_A,
      url: 'https://a.example.com',
      token: 'glpat-create',
    });

    expect(result.organizationId).toBe(ORG_A);
    expect(decryptToken(result.token)).toBe('glpat-create');
    expect(prisma.gitLabConfig.updateMany).not.toHaveBeenCalled();
  });

  it('refuses to run without an organization', async () => {
    await expect(
      storeOrgGitLabToken({
        organizationId: '',
        configId: 'cfg-b',
        url: 'https://b.example.com',
        token: 'glpat-x',
      })
    ).rejects.toThrow('organizationId is required');
    expect(prisma.gitLabConfig.updateMany).not.toHaveBeenCalled();
  });
});
