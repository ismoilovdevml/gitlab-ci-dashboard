/**
 * @jest-environment node
 */
import {
  GitLabCredentialsError,
  getUserGitLabCredentials,
  gitLabAuthHeaders,
} from '@/lib/gitlab/credentials';
import { encryptToken } from '@/lib/gitlab/token';

jest.mock('@/lib/db/prisma', () => ({ __esModule: true, default: {}, prisma: {} }));
jest.mock('@/lib/logger', () => ({
  logger: { error: jest.fn(), info: jest.fn(), warn: jest.fn(), debug: jest.fn() },
}));

describe('getUserGitLabCredentials', () => {
  const ORIGINAL_KEY = process.env.TOKEN_ENCRYPTION_KEY;

  beforeEach(() => {
    process.env.TOKEN_ENCRYPTION_KEY = 'credentials-test-key';
  });

  afterAll(() => {
    process.env.TOKEN_ENCRYPTION_KEY = ORIGINAL_KEY;
  });

  function expectCode(fn: () => unknown, code: string, status: number) {
    try {
      fn();
      throw new Error('expected an error');
    } catch (error) {
      expect(error).toBeInstanceOf(GitLabCredentialsError);
      expect((error as GitLabCredentialsError).code).toBe(code);
      expect((error as GitLabCredentialsError).status).toBe(status);
    }
  }

  it('decrypts an encrypted token and normalises the URL', () => {
    const creds = getUserGitLabCredentials({
      gitlabUrl: ' https://gitlab.example.com/gitlab/ ',
      gitlabToken: encryptToken('glpat-abc'),
    });
    expect(creds).toEqual({ baseUrl: 'https://gitlab.example.com/gitlab', token: 'glpat-abc' });
  });

  it('passes a legacy plaintext token through', () => {
    expect(
      getUserGitLabCredentials({ gitlabUrl: 'https://gitlab.example.com', gitlabToken: 'glpat-plain' }).token
    ).toBe('glpat-plain');
  });

  it.each([
    [{ gitlabUrl: '', gitlabToken: 'x' }],
    [{ gitlabUrl: '   ', gitlabToken: 'x' }],
    [{ gitlabUrl: 'https://gitlab.example.com', gitlabToken: '' }],
  ])('GITLAB_NOT_CONFIGURED for %j', (user) => {
    expectCode(() => getUserGitLabCredentials(user), 'GITLAB_NOT_CONFIGURED', 409);
  });

  it.each(['ftp://gitlab.example.com', 'not a url', 'https://user:pw@gitlab.example.com', 'https://g.example.com/?x=1'])(
    'GITLAB_URL_INVALID for %s',
    (gitlabUrl) => {
      expectCode(() => getUserGitLabCredentials({ gitlabUrl, gitlabToken: 'x' }), 'GITLAB_URL_INVALID', 400);
    }
  );

  it('GITLAB_TOKEN_UNREADABLE when the ciphertext is corrupt or the key is missing', () => {
    const stored = encryptToken('glpat-abc');
    expectCode(
      () => getUserGitLabCredentials({ gitlabUrl: 'https://g.example.com', gitlabToken: `${stored}00` }),
      'GITLAB_TOKEN_UNREADABLE',
      500
    );
    delete process.env.TOKEN_ENCRYPTION_KEY;
    expectCode(
      () => getUserGitLabCredentials({ gitlabUrl: 'https://g.example.com', gitlabToken: stored }),
      'GITLAB_TOKEN_UNREADABLE',
      500
    );
  });

  it('error messages never contain the token', () => {
    try {
      getUserGitLabCredentials({ gitlabUrl: 'ftp://x', gitlabToken: 'glpat-secret' });
    } catch (error) {
      expect(String((error as Error).message)).not.toContain('glpat-secret');
    }
  });

  it('builds the auth header', () => {
    expect(gitLabAuthHeaders({ baseUrl: 'https://g.example.com', token: 't' })).toEqual({ 'PRIVATE-TOKEN': 't' });
  });
});
