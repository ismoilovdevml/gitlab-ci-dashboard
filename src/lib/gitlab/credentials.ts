import type { AuthUser } from '@/lib/auth/types';
import { decryptToken, testGitLabConnection } from './token';
import { GitLabUrlError, isSameOrigin, normalizeGitLabBaseUrl } from './url';

/**
 * Single place where server code reads a user's GitLab token. Moving tokens to
 * the org-level GitLabConfig later only changes this file.
 */

export type GitLabCredentialsErrorCode =
  | 'GITLAB_NOT_CONFIGURED'
  | 'GITLAB_TOKEN_UNREADABLE'
  | 'GITLAB_URL_INVALID';

const STATUS_BY_CODE: Record<GitLabCredentialsErrorCode, number> = {
  GITLAB_NOT_CONFIGURED: 409,
  GITLAB_TOKEN_UNREADABLE: 500,
  GITLAB_URL_INVALID: 400,
};

const MESSAGE_BY_CODE: Record<GitLabCredentialsErrorCode, string> = {
  GITLAB_NOT_CONFIGURED: 'GitLab is not configured. Set the GitLab URL and access token in Settings.',
  GITLAB_TOKEN_UNREADABLE: 'The stored GitLab token could not be decrypted. Re-enter it in Settings.',
  GITLAB_URL_INVALID: 'The configured GitLab URL is invalid. Update it in Settings.',
};

export class GitLabCredentialsError extends Error {
  readonly code: GitLabCredentialsErrorCode;
  readonly status: number;

  constructor(code: GitLabCredentialsErrorCode) {
    super(MESSAGE_BY_CODE[code]);
    this.name = 'GitLabCredentialsError';
    this.code = code;
    this.status = STATUS_BY_CODE[code];
  }
}

export interface GitLabCredentials {
  /** Normalised base URL, e.g. `https://gitlab.example.com/gitlab`. */
  baseUrl: string;
  token: string;
}

/** @throws GitLabCredentialsError */
export function getUserGitLabCredentials(
  user: Pick<AuthUser, 'gitlabUrl' | 'gitlabToken'>
): GitLabCredentials {
  if (!user.gitlabUrl?.trim() || !user.gitlabToken) {
    throw new GitLabCredentialsError('GITLAB_NOT_CONFIGURED');
  }

  let baseUrl: string;
  try {
    baseUrl = normalizeGitLabBaseUrl(user.gitlabUrl);
  } catch (error) {
    if (error instanceof GitLabUrlError) throw new GitLabCredentialsError('GITLAB_URL_INVALID');
    throw error;
  }

  let token: string;
  try {
    token = decryptToken(user.gitlabToken);
  } catch {
    // The underlying error may carry key material context; it is not propagated.
    throw new GitLabCredentialsError('GITLAB_TOKEN_UNREADABLE');
  }
  if (!token) throw new GitLabCredentialsError('GITLAB_NOT_CONFIGURED');

  return { baseUrl, token };
}

/** Request headers that authenticate against the GitLab REST API. */
export function gitLabAuthHeaders(credentials: GitLabCredentials): Record<string, string> {
  return { 'PRIVATE-TOKEN': credentials.token };
}

export interface StoredTokenStatus {
  configured: boolean;
  /** False when a stored token exists but cannot be decrypted. */
  readable: boolean;
  /** Length of the decrypted token; 0 when missing or unreadable. */
  length: number;
}

/** Describes the stored token for masked display without exposing it. */
export function getStoredTokenStatus(user: { gitlabToken?: string | null }): StoredTokenStatus {
  if (!user.gitlabToken) return { configured: false, readable: true, length: 0 };
  try {
    return { configured: true, readable: true, length: decryptToken(user.gitlabToken).length };
  } catch {
    return { configured: true, readable: false, length: 0 };
  }
}

export type StoredConnectionTestResult =
  | { tested: false; reason: 'NEW_TOKEN_REQUIRED' | 'STORED_TOKEN_UNREADABLE' }
  | { tested: true; success: boolean; username?: string; error?: string };

/**
 * Test the connection to `targetUrl` (default: the user's configured URL) with
 * the stored token. The stored token is only sent to the origin it was saved
 * for; any other origin requires the user to enter a token.
 */
export async function testStoredGitLabConnection(
  user: Pick<AuthUser, 'gitlabUrl' | 'gitlabToken'>,
  targetUrl: string = user.gitlabUrl
): Promise<StoredConnectionTestResult> {
  if (!user.gitlabToken || !isSameOrigin(targetUrl, user.gitlabUrl)) {
    return { tested: false, reason: 'NEW_TOKEN_REQUIRED' };
  }

  let token: string;
  try {
    token = decryptToken(user.gitlabToken);
  } catch {
    return { tested: false, reason: 'STORED_TOKEN_UNREADABLE' };
  }
  if (!token) return { tested: false, reason: 'STORED_TOKEN_UNREADABLE' };

  const result = await testGitLabConnection(targetUrl, token);
  return { tested: true, ...result };
}
