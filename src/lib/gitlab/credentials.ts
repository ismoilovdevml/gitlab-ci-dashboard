import type { AuthUser } from '@/lib/auth/types';
import { decryptToken } from './token';
import { GitLabUrlError, normalizeGitLabBaseUrl } from './url';

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
