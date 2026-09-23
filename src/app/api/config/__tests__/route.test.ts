/**
 * @jest-environment node
 */
import { NextRequest } from 'next/server';
import { csrfRequest, TEST_SESSION_SECRET } from '@/lib/testing/csrf';
import { decryptToken, encryptToken } from '@/lib/gitlab/token';
import { getCurrentUser } from '@/lib/auth';
import { GET, POST } from '../route';

const mockPrisma = { user: { update: jest.fn() } };

jest.mock('@/lib/db/prisma', () => ({
  __esModule: true,
  get default() {
    return mockPrisma;
  },
  get prisma() {
    return mockPrisma;
  },
}));

jest.mock('@/lib/db/redis', () => ({
  cacheHelpers: { invalidate: jest.fn() },
}));

jest.mock('@/lib/logger', () => ({
  logger: { error: jest.fn(), info: jest.fn(), warn: jest.fn(), debug: jest.fn() },
}));

jest.mock('@/lib/auth', () => ({
  getCurrentUser: jest.fn(),
}));

const mockGetCurrentUser = getCurrentUser as jest.Mock;
const url = 'http://localhost/api/config';

function baseUser(overrides: Record<string, unknown> = {}) {
  return {
    id: 'u1',
    gitlabUrl: 'https://gitlab.example.com',
    gitlabToken: '',
    autoRefresh: true,
    refreshInterval: 10000,
    theme: 'dark',
    notifyPipelineFailures: true,
    notifyPipelineSuccess: false,
    ...overrides,
  };
}

describe('/api/config', () => {
  const ORIGINAL_KEY = process.env.TOKEN_ENCRYPTION_KEY;

  beforeAll(() => {
    process.env.SESSION_SECRET = TEST_SESSION_SECRET;
    process.env.TOKEN_ENCRYPTION_KEY = 'config-route-test-key';
  });

  afterAll(() => {
    process.env.TOKEN_ENCRYPTION_KEY = ORIGINAL_KEY;
  });

  beforeEach(() => {
    jest.clearAllMocks();
    mockGetCurrentUser.mockResolvedValue(baseUser());
    mockPrisma.user.update.mockImplementation(({ data }) =>
      Promise.resolve(baseUser({ gitlabUrl: data.gitlabUrl, gitlabToken: data.gitlabToken ?? '' }))
    );
  });

  describe('POST', () => {
    it('encrypts the token at rest and never returns it', async () => {
      const res = await POST(
        csrfRequest(url, 'POST', 'valid', { url: 'https://gitlab.example.com/', token: 'glpat-plain-secret' })
      );

      expect(res.status).toBe(200);
      const { data } = mockPrisma.user.update.mock.calls[0][0];
      expect(data.gitlabUrl).toBe('https://gitlab.example.com');
      expect(data.gitlabToken).toMatch(/^tok:/);
      expect(data.gitlabToken).not.toContain('glpat-plain-secret');
      expect(decryptToken(data.gitlabToken)).toBe('glpat-plain-secret');

      const body = await res.json();
      expect(body.token).toBe('***MASKED***');
      expect(JSON.stringify(body)).not.toContain('glpat-plain-secret');
    });

    it.each(['not a url', 'ftp://gitlab.example.com', 'https://u:p@gitlab.example.com', ''])(
      'rejects invalid GitLab URL %p with 400',
      async (badUrl) => {
        const res = await POST(csrfRequest(url, 'POST', 'valid', { url: badUrl, token: 'glpat-x' }));

        expect(res.status).toBe(400);
        expect(mockPrisma.user.update).not.toHaveBeenCalled();
      }
    );

    it('rejects a body that fails schema validation', async () => {
      const res = await POST(
        csrfRequest(url, 'POST', 'valid', { url: 'https://gitlab.example.com', refreshInterval: 1 })
      );

      expect(res.status).toBe(400);
      expect(mockPrisma.user.update).not.toHaveBeenCalled();
    });

    it('rejects a non-JSON body', async () => {
      const req = csrfRequest(url, 'POST', 'valid');
      const res = await POST(new NextRequest(url, { method: 'POST', headers: req.headers, body: '{nope' }));

      expect(res.status).toBe(400);
    });

    it('leaves the stored token unchanged when a masked placeholder is sent', async () => {
      await POST(csrfRequest(url, 'POST', 'valid', { url: 'https://gitlab.example.com', token: '***MASKED***' }));

      expect(mockPrisma.user.update.mock.calls[0][0].data.gitlabToken).toBeUndefined();
    });

    it('does not overwrite fields that were not sent', async () => {
      await POST(csrfRequest(url, 'POST', 'valid', { theme: 'light' }));

      const { data } = mockPrisma.user.update.mock.calls[0][0];
      expect(data.theme).toBe('light');
      expect(data.gitlabUrl).toBeUndefined();
      expect(data.gitlabToken).toBeUndefined();
      expect(data.autoRefresh).toBeUndefined();
    });
  });

  describe('GET', () => {
    it('returns the decrypted token when unmask=true', async () => {
      mockGetCurrentUser.mockResolvedValue(baseUser({ gitlabToken: encryptToken('glpat-encrypted') }));

      const res = await GET(new NextRequest(`${url}?unmask=true`));

      expect(res.status).toBe(200);
      expect((await res.json()).token).toBe('glpat-encrypted');
    });

    it('still reads a legacy plaintext token', async () => {
      mockGetCurrentUser.mockResolvedValue(baseUser({ gitlabToken: 'glpat-legacy-plain' }));

      const res = await GET(new NextRequest(`${url}?unmask=true`));

      expect((await res.json()).token).toBe('glpat-legacy-plain');
    });

    it('masks the token without unmask', async () => {
      mockGetCurrentUser.mockResolvedValue(baseUser({ gitlabToken: encryptToken('glpat-encrypted') }));

      const body = await (await GET(new NextRequest(url))).json();

      expect(body.token).toBe('***MASKED***');
      expect(body.tokenConfigured).toBe(true);
      expect(body.tokenLength).toBe('glpat-encrypted'.length);
    });

    it('returns 500 instead of ciphertext when the token cannot be decrypted', async () => {
      mockGetCurrentUser.mockResolvedValue(baseUser({ gitlabToken: 'tok:00:00:00' }));

      const res = await GET(new NextRequest(`${url}?unmask=true`));

      expect(res.status).toBe(500);
      expect(JSON.stringify(await res.json())).not.toContain('tok:');
    });
  });
});
