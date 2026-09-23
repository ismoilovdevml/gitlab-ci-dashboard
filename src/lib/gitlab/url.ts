/**
 * Validation for outbound requests to the configured GitLab instance.
 *
 * Private/LAN addresses are intentionally allowed: self-hosted GitLab on an
 * internal network is the primary deployment. The protection instead is that
 * credentials are only ever sent to the configured GitLab origin.
 */

export class GitLabUrlError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'GitLabUrlError';
  }
}

const ALLOWED_PROTOCOLS = new Set(['http:', 'https:']);

function assertSafeUrl(url: URL, label: string): void {
  if (!ALLOWED_PROTOCOLS.has(url.protocol)) {
    throw new GitLabUrlError(`${label} must use http or https`);
  }
  if (url.username || url.password) {
    throw new GitLabUrlError(`${label} must not contain credentials`);
  }
  if (!url.hostname) {
    throw new GitLabUrlError(`${label} must include a host`);
  }
}

/**
 * Validate and normalise a GitLab base URL.
 * Returns `scheme://host[:port][/relative-root]` without a trailing slash.
 * A relative root path (e.g. `https://host/gitlab`) is preserved.
 */
export function normalizeGitLabBaseUrl(raw: string): string {
  const trimmed = (raw ?? '').trim();
  if (!trimmed) {
    throw new GitLabUrlError('GitLab URL is empty');
  }

  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    throw new GitLabUrlError('GitLab URL is not a valid URL');
  }

  assertSafeUrl(url, 'GitLab URL');

  if (url.search || url.hash) {
    throw new GitLabUrlError('GitLab URL must not contain a query string or fragment');
  }

  const path = url.pathname.replace(/\/+$/, '');
  return `${url.origin}${path}`;
}

/** True when both URLs share scheme, host and port. */
export function isSameOrigin(a: string | URL, b: string | URL): boolean {
  try {
    return new URL(a.toString()).origin === new URL(b.toString()).origin;
  } catch {
    return false;
  }
}

/**
 * Resolve a redirect `Location` header against the URL that returned it and
 * validate the result. Throws GitLabUrlError for unsafe targets.
 */
export function resolveRedirectUrl(location: string, currentUrl: string): URL {
  let target: URL;
  try {
    target = new URL(location, currentUrl);
  } catch {
    throw new GitLabUrlError('Redirect target is not a valid URL');
  }
  assertSafeUrl(target, 'Redirect target');
  return target;
}
