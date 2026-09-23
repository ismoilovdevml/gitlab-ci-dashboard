/**
 * @jest-environment node
 */
import { getStoredTokenStatus, testStoredGitLabConnection } from '@/lib/gitlab/credentials';
import { encryptToken, testGitLabConnection } from '@/lib/gitlab/token';

jest.mock('@/lib/db/prisma', () => ({ __esModule: true, default: {}, prisma: {} }));
jest.mock('@/lib/logger', () => ({
  logger: { error: jest.fn(), info: jest.fn(), warn: jest.fn(), debug: jest.fn() },
}));
jest.mock('@/lib/gitlab/token', () => ({
  ...jest.requireActual('@/lib/gitlab/token'),
  testGitLabConnection: jest.fn(),
}));

const mockTest = testGitLabConnection as jest.Mock;
const GITLAB = 'https://gitlab.example.com';

describe('stored GitLab token helpers', () => {
  const ORIGINAL_KEY = process.env.TOKEN_ENCRYPTION_KEY;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env.TOKEN_ENCRYPTION_KEY = 'stored-token-test-key';
    mockTest.mockResolvedValue({ success: true, username: 'root' });
  });

  afterAll(() => {
    if (ORIGINAL_KEY === undefined) delete process.env.TOKEN_ENCRYPTION_KEY;
    else process.env.TOKEN_ENCRYPTION_KEY = ORIGINAL_KEY;
  });

  function unreadableToken(): string {
    const stored = encryptToken('secret');
    process.env.TOKEN_ENCRYPTION_KEY = 'a-different-key';
    return stored;
  }

  describe('getStoredTokenStatus', () => {
    it.each([undefined, null, ''])('reports %p as not configured', (gitlabToken) => {
      expect(getStoredTokenStatus({ gitlabToken })).toEqual({ configured: false, readable: true, length: 0 });
    });

    it('returns the decrypted length of an encrypted token', () => {
      const status = getStoredTokenStatus({ gitlabToken: encryptToken('glpat-12345') });
      expect(status).toEqual({ configured: true, readable: true, length: 'glpat-12345'.length });
    });

    it('accepts legacy plaintext tokens', () => {
      expect(getStoredTokenStatus({ gitlabToken: 'glpat-plain' }).length).toBe('glpat-plain'.length);
    });

    it('reports a token that cannot be decrypted as unreadable', () => {
      const status = getStoredTokenStatus({ gitlabToken: unreadableToken() });
      expect(status).toEqual({ configured: true, readable: false, length: 0 });
    });

    it('never includes the token in the result', () => {
      const status = getStoredTokenStatus({ gitlabToken: encryptToken('glpat-secret') });
      expect(JSON.stringify(status)).not.toContain('glpat-secret');
    });
  });

  describe('testStoredGitLabConnection', () => {
    it('tests the configured URL with the decrypted token by default', async () => {
      const result = await testStoredGitLabConnection({ gitlabUrl: GITLAB, gitlabToken: encryptToken('glpat-stored') });
      expect(mockTest).toHaveBeenCalledWith(GITLAB, 'glpat-stored');
      expect(result).toEqual({ tested: true, success: true, username: 'root' });
    });

    it('allows another path on the same origin', async () => {
      await testStoredGitLabConnection(
        { gitlabUrl: GITLAB, gitlabToken: encryptToken('glpat-stored') },
        `${GITLAB}/gitlab`
      );
      expect(mockTest).toHaveBeenCalledWith(`${GITLAB}/gitlab`, 'glpat-stored');
    });

    it.each([
      'https://other.example.com',
      'http://gitlab.example.com',
      'https://gitlab.example.com:8443',
    ])('requires a new token for a different origin (%s)', async (target) => {
      const result = await testStoredGitLabConnection(
        { gitlabUrl: GITLAB, gitlabToken: encryptToken('glpat-stored') },
        target
      );
      expect(result).toEqual({ tested: false, reason: 'NEW_TOKEN_REQUIRED' });
      expect(mockTest).not.toHaveBeenCalled();
    });

    it('requires a new token when none is stored', async () => {
      const result = await testStoredGitLabConnection({ gitlabUrl: GITLAB, gitlabToken: '' });
      expect(result).toEqual({ tested: false, reason: 'NEW_TOKEN_REQUIRED' });
      expect(mockTest).not.toHaveBeenCalled();
    });

    it('reports an unreadable stored token without calling GitLab', async () => {
      const result = await testStoredGitLabConnection({ gitlabUrl: GITLAB, gitlabToken: unreadableToken() });
      expect(result).toEqual({ tested: false, reason: 'STORED_TOKEN_UNREADABLE' });
      expect(mockTest).not.toHaveBeenCalled();
    });

    it('passes a failed connection through', async () => {
      mockTest.mockResolvedValue({ success: false, error: 'Invalid token' });
      const result = await testStoredGitLabConnection({ gitlabUrl: GITLAB, gitlabToken: 'glpat-plain' });
      expect(result).toEqual({ tested: true, success: false, error: 'Invalid token' });
    });
  });
});
