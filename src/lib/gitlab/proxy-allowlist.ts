/**
 * Allowlist for the server-side GitLab API proxy (`/api/gitlab/v4/...`).
 *
 * It mirrors exactly what the browser client (`src/lib/gitlab-api.ts`) calls,
 * so a session can only drive the stored token against these endpoints.
 * Adding an endpoint here widens what any logged-in user can do with their
 * token through the proxy; keep it minimal.
 *
 * Placeholders: `:id` is a positive integer, `:tag` a container tag name.
 */

export type ProxyMethod = 'GET' | 'POST' | 'DELETE';

export interface ProxyRoute {
  method: ProxyMethod;
  pattern: string;
}

export const PROXY_ALLOWLIST: readonly ProxyRoute[] = [
  { method: 'GET', pattern: 'projects' },
  { method: 'GET', pattern: 'projects/:id' },
  { method: 'GET', pattern: 'projects/:id/repository/branches' },
  { method: 'GET', pattern: 'projects/:id/repository/tags' },
  { method: 'GET', pattern: 'projects/:id/pipelines' },
  { method: 'GET', pattern: 'projects/:id/pipelines/:id' },
  { method: 'GET', pattern: 'projects/:id/pipelines/:id/jobs' },
  { method: 'GET', pattern: 'projects/:id/jobs' },
  { method: 'GET', pattern: 'projects/:id/jobs/:id' },
  { method: 'GET', pattern: 'projects/:id/jobs/:id/trace' },
  { method: 'GET', pattern: 'projects/:id/runners' },
  { method: 'GET', pattern: 'projects/:id/registry/repositories' },
  { method: 'GET', pattern: 'projects/:id/registry/repositories/:id/tags' },
  { method: 'GET', pattern: 'runners/all' },
  { method: 'GET', pattern: 'runners/:id' },
  { method: 'GET', pattern: 'runners/:id/jobs' },

  { method: 'POST', pattern: 'projects/:id/star' },
  { method: 'POST', pattern: 'projects/:id/unstar' },
  { method: 'POST', pattern: 'projects/:id/pipelines/:id/retry' },
  { method: 'POST', pattern: 'projects/:id/pipelines/:id/cancel' },
  { method: 'POST', pattern: 'projects/:id/jobs/:id/retry' },
  { method: 'POST', pattern: 'projects/:id/jobs/:id/cancel' },
  { method: 'POST', pattern: 'projects/:id/jobs/:id/play' },

  { method: 'DELETE', pattern: 'projects/:id/jobs/:id/artifacts' },
  { method: 'DELETE', pattern: 'projects/:id/registry/repositories/:id' },
  { method: 'DELETE', pattern: 'projects/:id/registry/repositories/:id/tags/:tag' },
];

/**
 * Query parameters forwarded upstream. Everything else is dropped, which
 * also removes credential parameters such as `private_token`.
 */
export const PROXY_ALLOWED_QUERY_PARAMS: ReadonlySet<string> = new Set([
  'page',
  'per_page',
  'order_by',
  'sort',
  'membership',
  'statistics',
  'simple',
  'search',
  'status',
  'ref',
  'scope',
  'scope[]',
  'updated_after',
  'updated_before',
]);

const MAX_QUERY_VALUE_LENGTH = 256;

const PLACEHOLDERS: Record<string, RegExp> = {
  ':id': /^[1-9][0-9]{0,18}$/,
  ':tag': /^[A-Za-z0-9_.-]{1,128}$/,
};

/**
 * True when every segment is safe to place in an upstream path. Segments are
 * already percent-decoded by Next, so an encoded `/`, `\` or `..` shows up here.
 */
export function areSegmentsSafe(segments: readonly string[]): boolean {
  if (segments.length === 0) return false;
  return segments.every(
    (s) =>
      s.length > 0 &&
      s !== '.' &&
      s !== '..' &&
      !s.includes('/') &&
      !s.includes('\\') &&
      !s.includes('%')
  );
}

function segmentMatches(patternSegment: string, segment: string): boolean {
  const placeholder = PLACEHOLDERS[patternSegment];
  if (placeholder) return placeholder.test(segment);
  return patternSegment === segment;
}

function patternMatches(pattern: string, segments: readonly string[]): boolean {
  const parts = pattern.split('/');
  if (parts.length !== segments.length) return false;
  return parts.every((part, i) => segmentMatches(part, segments[i]));
}

export type ProxyMatch =
  | { ok: true; route: ProxyRoute }
  | { ok: false; reason: 'not_found' }
  | { ok: false; reason: 'method_not_allowed'; allow: ProxyMethod[] };

/** Match a method and (already validated) path segments against the allowlist. */
export function matchProxyRoute(method: string, segments: readonly string[]): ProxyMatch {
  const matching = PROXY_ALLOWLIST.filter((r) => patternMatches(r.pattern, segments));
  if (matching.length === 0) return { ok: false, reason: 'not_found' };

  const route = matching.find((r) => r.method === method);
  if (route) return { ok: true, route };

  return {
    ok: false,
    reason: 'method_not_allowed',
    allow: Array.from(new Set(matching.map((r) => r.method))),
  };
}

/** Path under which the proxy is mounted. */
export const PROXY_PREFIX = '/api/gitlab/v4/';

/** `<relative root>/api/v4/` for a normalised GitLab base URL. */
export function gitLabApiPathPrefix(baseUrl: string): string {
  const basePath = new URL(baseUrl).pathname.replace(/\/+$/, '');
  return `${basePath}/api/v4/`;
}

/**
 * Rewrite GitLab pagination links to the proxy path. Entries that do not point
 * at the GitLab API are dropped rather than exposed. The host is ignored
 * because GitLab builds links from its external_url, which may differ from the
 * URL configured here.
 */
export function rewriteLinkHeader(link: string, baseUrl: string): string | null {
  const prefix = gitLabApiPathPrefix(baseUrl);
  const entries: string[] = [];
  const re = /<([^>]*)>([^,]*)/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(link)) !== null) {
    let target: URL;
    try {
      target = new URL(match[1], baseUrl);
    } catch {
      continue;
    }
    if (!target.pathname.startsWith(prefix)) continue;
    const rest = target.pathname.slice(prefix.length).split('/');
    if (!areSegmentsSafe(rest)) continue;
    const query = filterQueryParams(target.searchParams).toString();
    entries.push(`<${PROXY_PREFIX}${rest.join('/')}${query ? `?${query}` : ''}>${match[2].trimEnd()}`);
  }
  return entries.length > 0 ? entries.join(', ') : null;
}

/** Copy only allowlisted query parameters. */
export function filterQueryParams(input: URLSearchParams): URLSearchParams {
  const out = new URLSearchParams();
  input.forEach((value, key) => {
    if (PROXY_ALLOWED_QUERY_PARAMS.has(key) && value.length <= MAX_QUERY_VALUE_LENGTH) {
      out.append(key, value);
    }
  });
  return out;
}
