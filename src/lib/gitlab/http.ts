import axios, { AxiosInstance, CreateAxiosDefaults } from 'axios';
import { GitLabUrlError, isSameOrigin, normalizeGitLabBaseUrl } from './url';

/**
 * Axios instance for the GitLab REST API that can never send the
 * PRIVATE-TOKEN header to an origin other than the configured one.
 *
 * Imported by both server code and browser bundles, so it must stay free of
 * Node-only modules.
 */
export interface GitLabHttpClient {
  /** Normalised GitLab base URL, e.g. `https://gitlab.example.com/gitlab`. */
  baseUrl: string;
  client: AxiosInstance;
}

function isBrowser(): boolean {
  return typeof window !== 'undefined' && typeof window.fetch === 'function';
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
    // Node http adapter: return 3xx as-is instead of following it.
    maxRedirects: 0,
    // XHR follows redirects transparently and keeps custom headers, so in the
    // browser use fetch with manual redirects (yields an opaque status-0 response).
    ...(isBrowser() ? { adapter: 'fetch' as const, fetchOptions: { redirect: 'manual' as const } } : {}),
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
    // axios resolves status 0 (opaque redirect) as success; treat any redirect as an error.
    if (response.status === 0 || (response.status >= 300 && response.status < 400)) {
      throw new GitLabUrlError('GitLab responded with a redirect; redirects are not followed');
    }
    return response;
  });

  return { baseUrl, client };
}
