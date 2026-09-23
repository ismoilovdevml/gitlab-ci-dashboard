/**
 * @jest-environment node
 */
import { NextRequest } from 'next/server';
import { csrfRequest, TEST_SESSION_SECRET } from '@/lib/testing/csrf';
import { decryptToken, encryptToken, testGitLabConnection } from '@/lib/gitlab/token';
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

jest.mock('@/lib/gitlab/token', () => ({
  ...jest.requireActual('@/lib/gitlab/token'),
  testGitLabConnection: jest.fn(),
}));

const mockGetCurrentUser = getCurrentUser as jest.Mock;
const mockTestConnection = testGitLabConnection as jest.Mock;
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
    mockTestConnection.mockResolvedValue({ success: true, username: 'root' });
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
      expect(body.gitlabUsername).toBe('root');
      expect(JSON.stringify(body)).not.toContain('glpat-plain-secret');
      expect(mockTestConnection).toHaveBeenCalledWith('https://gitlab.example.com', 'glpat-plain-secret');
    });

    it('does not save when the server-side connection test fails', async () => {
      mockTestConnection.mockResolvedValue({ success: false, error: 'Invalid token' });

      const res = await POST(
        csrfRequest(url, 'POST', 'valid', { url: 'https://gitlab.example.com', token: 'glpat-wrong' })
      );

      expect(res.status).toBe(400);
      expect(await res.json()).toMatchObject({ error: 'Invalid token', code: 'GITLAB_CONNECTION_FAILED' });
      expect(mockPrisma.user.update).not.toHaveBeenCalled();
    });

    it.each(['', '***MASKED***', '***'])(
      'keeps and tests the stored token when %p is sent for the same origin',
      async (token) => {
        mockGetCurrentUser.mockResolvedValue(baseUser({ gitlabToken: encryptToken('glpat-stored') }));

        const res = await POST(
          csrfRequest(url, 'POST', 'valid', { url: 'https://gitlab.example.com/gitlab', token })
        );

        expect(res.status).toBe(200);
        expect(mockTestConnection).toHaveBeenCalledWith('https://gitlab.example.com/gitlab', 'glpat-stored');
        const { data } = mockPrisma.user.update.mock.calls[0][0];
        expect(data.gitlabUrl).toBe('https://gitlab.example.com/gitlab');
        expect(data.gitlabToken).toBeUndefined();
      }
    );

    it.each(['https://evil.example.com', 'http://gitlab.example.com', 'https://gitlab.example.com:8443'])(
      'requires a new token when the origin changes to %p',
      async (newUrl) => {
        mockGetCurrentUser.mockResolvedValue(baseUser({ gitlabToken: encryptToken('glpat-stored') }));

        const res = await POST(csrfRequest(url, 'POST', 'valid', { url: newUrl, token: '***MASKED***' }));

        expect(res.status).toBe(400);
        expect((await res.json()).code).toBe('GITLAB_NEW_TOKEN_REQUIRED');
        expect(mockTestConnection).not.toHaveBeenCalled();
        expect(mockPrisma.user.update).not.toHaveBeenCalled();
      }
    );

    it('requires a token when none is stored', async () => {
      const res = await POST(csrfRequest(url, 'POST', 'valid', { url: 'https://gitlab.example.com', token: '' }));

      expect(res.status).toBe(400);
      expect((await res.json()).code).toBe('GITLAB_NEW_TOKEN_REQUIRED');
      expect(mockPrisma.user.update).not.toHaveBeenCalled();
    });

    it('asks for a new token when the stored one cannot be decrypted', async () => {
      mockGetCurrentUser.mockResolvedValue(baseUser({ gitlabToken: 'tok:00:00:00' }));

      const res = await POST(csrfRequest(url, 'POST', 'valid', { url: 'https://gitlab.example.com', token: '' }));

      expect(res.status).toBe(400);
      expect((await res.json()).code).toBe('GITLAB_STORED_TOKEN_UNREADABLE');
      expect(mockTestConnection).not.toHaveBeenCalled();
    });

    it('tests a new token against the stored URL when only the token is sent', async () => {
      await POST(csrfRequest(url, 'POST', 'valid', { token: 'glpat-new' }));

      expect(mockTestConnection).toHaveBeenCalledWith('https://gitlab.example.com', 'glpat-new');
      expect(decryptToken(mockPrisma.user.update.mock.calls[0][0].data.gitlabToken)).toBe('glpat-new');
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

    it('does not overwrite fields that were not sent', async () => {
      await POST(csrfRequest(url, 'POST', 'valid', { theme: 'light' }));

      const { data } = mockPrisma.user.update.mock.calls[0][0];
      expect(data.theme).toBe('light');
      expect(data.gitlabUrl).toBeUndefined();
      expect(data.gitlabToken).toBeUndefined();
      expect(data.autoRefresh).toBeUndefined();
      expect(mockTestConnection).not.toHaveBeenCalled();
    });
  });

  describe('GET', () => {
    it('always masks the token (the handler ignores the query string)', async () => {
      mockGetCurrentUser.mockResolvedValue(baseUser({ gitlabToken: encryptToken('glpat-encrypted') }));

      const res = await GET();

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.token).toBe('***MASKED***');
      expect(JSON.stringify(body)).not.toContain('glpat-encrypted');
    });

    it('reports a configured token and its length', async () => {
      mockGetCurrentUser.mockResolvedValue(baseUser({ gitlabToken: encryptToken('glpat-encrypted') }));

      const body = await (await GET()).json();

      expect(body.token).toBe('***MASKED***');
      expect(body.tokenConfigured).toBe(true);
      expect(body.tokenLength).toBe('glpat-encrypted'.length);
    });

    it('still reads a legacy plaintext token without returning it', async () => {
      mockGetCurrentUser.mockResolvedValue(baseUser({ gitlabToken: 'glpat-legacy-plain' }));

      const body = await (await GET()).json();

      expect(body.tokenLength).toBe('glpat-legacy-plain'.length);
      expect(JSON.stringify(body)).not.toContain('glpat-legacy-plain');
    });

    it('never returns ciphertext when the token cannot be decrypted', async () => {
      mockGetCurrentUser.mockResolvedValue(baseUser({ gitlabToken: 'tok:00:00:00' }));

      const res = await GET();

      expect(res.status).toBe(200);
      expect(JSON.stringify(await res.json())).not.toContain('tok:');
    });

    it('returns an empty token when none is configured', async () => {
      const body = await (await GET()).json();

      expect(body).toMatchObject({ token: '', tokenConfigured: false });
    });
  });
});
