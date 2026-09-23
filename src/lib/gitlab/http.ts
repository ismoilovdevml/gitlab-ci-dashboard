import axios, { AxiosInstance, CreateAxiosDefaults } from 'axios';
import { GitLabUrlError, isSameOrigin, normalizeGitLabBaseUrl } from './url';

/**
 * Axios instance for the GitLab REST API that can never send the
 * PRIVATE-TOKEN header to an origin other than the configured one.
 * Server-only: GitLab is reached through the API routes, never from the browser.
 */
export interface GitLabHttpClient {
  /** Normalised GitLab base URL, e.g. `https://gitlab.example.com/gitlab`. */
  baseUrl: string;
  client: AxiosInstance;
}

export function createGitLabHttpClient(
  rawBaseUrl: string,
  token: string,
  options: Omit<CreateAxiosDefaults, 'baseURL' | 'headers'> & {
    headers?: Record<string, string>;
  } = {}
): GitLabHttpClient {
  const baseUrl = normalizeGitLabBaseUrl(rawBaseUrl);

  const client = axios.create({
    ...options,
    baseURL: `${baseUrl}/api/v4`,
    allowAbsoluteUrls: false,
    // Return 3xx as-is instead of following it.
    maxRedirects: 0,
    headers: {
      ...options.headers,
      'PRIVATE-TOKEN': token,
    },
  });

  client.interceptors.request.use((config) => {
    if (!isSameOrigin(client.getUri(config), baseUrl)) {
      throw new GitLabUrlError('Refusing to send GitLab credentials to a different origin');
    }
    return config;
  });

  client.interceptors.response.use((response) => {
    if (response.status >= 300 && response.status < 400) {
      throw new GitLabUrlError('GitLab responded with a redirect; redirects are not followed');
    }
    return response;
  });

  return { baseUrl, client };
}
