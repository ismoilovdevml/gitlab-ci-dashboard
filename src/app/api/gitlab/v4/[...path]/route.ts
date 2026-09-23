import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { requireCsrf } from '@/lib/csrf';
import { logger } from '@/lib/logger';
import {
  GitLabCredentials,
  GitLabCredentialsError,
  getUserGitLabCredentials,
  gitLabAuthHeaders,
} from '@/lib/gitlab/credentials';
import {
  PROXY_PREFIX,
  areSegmentsSafe,
  filterQueryParams,
  gitLabApiPathPrefix,
  matchProxyRoute,
  rewriteLinkHeader,
} from '@/lib/gitlab/proxy-allowlist';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const UPSTREAM_TIMEOUT_MS = 30_000;

const PASSTHROUGH_HEADERS = [
  'content-type',
  'x-total',
  'x-total-pages',
  'x-page',
  'x-per-page',
  'x-next-page',
  'x-prev-page',
  'retry-after',
];

interface RouteContext {
  params: Promise<{ path?: string[] }>;
}

function noStoreHeaders(extra?: Record<string, string>): Headers {
  const headers = new Headers(extra);
  headers.set('Cache-Control', 'private, no-store');
  return headers;
}

function errorJson(status: number, code: string, error: string, extra?: Record<string, string>) {
  return NextResponse.json({ error, code }, { status, headers: noStoreHeaders(extra) });
}

function buildResponseHeaders(upstream: Response, baseUrl: string): Headers {
  const headers = noStoreHeaders();
  for (const name of PASSTHROUGH_HEADERS) {
    const value = upstream.headers.get(name);
    if (value !== null) headers.set(name, value);
  }
  upstream.headers.forEach((value, name) => {
    if (name.toLowerCase().startsWith('ratelimit-')) headers.set(name, value);
  });
  const link = upstream.headers.get('link');
  if (link) {
    const rewritten = rewriteLinkHeader(link, baseUrl);
    if (rewritten) headers.set('Link', rewritten);
  }
  return headers;
}

/** Build the upstream URL and assert it stays on the configured origin and API path. */
function buildUpstreamUrl(credentials: GitLabCredentials, segments: string[], query: URLSearchParams): URL {
  const base = new URL(credentials.baseUrl);
  const url = new URL(`${credentials.baseUrl}/api/v4/${segments.join('/')}`);
  if (url.origin !== base.origin || !url.pathname.startsWith(gitLabApiPathPrefix(credentials.baseUrl))) {
    throw new Error('Upstream URL escaped the configured GitLab API');
  }
  url.search = query.toString();
  return url;
}

function rawPathIsSafe(request: NextRequest): boolean {
  const pathname = request.nextUrl.pathname;
  const idx = pathname.indexOf(PROXY_PREFIX);
  const rest = idx >= 0 ? pathname.slice(idx + PROXY_PREFIX.length) : pathname;
  return !rest.includes('%') && !rest.includes('\\');
}

async function proxy(request: NextRequest, context: RouteContext): Promise<Response> {
  const method = request.method.toUpperCase();

  const user = await getCurrentUser();
  if (!user) return errorJson(401, 'UNAUTHORIZED', 'Unauthorized');

  if (method !== 'GET' && method !== 'HEAD') {
    const csrfError = requireCsrf(request);
    if (csrfError) {
      csrfError.headers.set('Cache-Control', 'private, no-store');
      return csrfError;
    }
  }

  const { path } = await context.params;
  const segments = path ?? [];
  if (!areSegmentsSafe(segments) || !rawPathIsSafe(request)) {
    return errorJson(400, 'INVALID_PATH', 'Invalid GitLab API path');
  }

  const match = matchProxyRoute(method === 'HEAD' ? 'GET' : method, segments);
  if (!match.ok) {
    if (match.reason === 'method_not_allowed') {
      return errorJson(405, 'METHOD_NOT_ALLOWED', 'Method not allowed', { Allow: match.allow.join(', ') });
    }
    return errorJson(404, 'NOT_FOUND', 'GitLab API endpoint is not available through the proxy');
  }
  const pattern = match.route.pattern;

  let credentials: GitLabCredentials;
  try {
    credentials = getUserGitLabCredentials(user);
  } catch (error) {
    if (error instanceof GitLabCredentialsError) {
      return errorJson(error.status, error.code, error.message);
    }
    throw error;
  }

  let upstreamUrl: URL;
  try {
    upstreamUrl = buildUpstreamUrl(credentials, segments, filterQueryParams(request.nextUrl.searchParams));
  } catch {
    return errorJson(400, 'INVALID_PATH', 'Invalid GitLab API path');
  }

  const started = Date.now();
  const logContext = (status: number) => ({
    method,
    pattern,
    status,
    durationMs: Date.now() - started,
  });

  let upstream: Response;
  try {
    upstream = await fetch(upstreamUrl, {
      method: method === 'HEAD' ? 'GET' : method,
      headers: {
        Accept: request.headers.get('accept') || 'application/json',
        ...gitLabAuthHeaders(credentials),
      },
      redirect: 'manual',
      cache: 'no-store',
      signal: AbortSignal.any([request.signal, AbortSignal.timeout(UPSTREAM_TIMEOUT_MS)]),
    });
  } catch (error) {
    const timedOut = error instanceof Error && error.name === 'TimeoutError';
    const status = timedOut ? 504 : 502;
    // Only the error name: fetch errors can reference the request, which holds the token.
    logger.warn('GitLab proxy request failed', {
      ...logContext(status),
      errorName: error instanceof Error ? error.name : 'unknown',
    });
    return errorJson(
      status,
      timedOut ? 'GITLAB_TIMEOUT' : 'GITLAB_UNREACHABLE',
      timedOut ? 'GitLab did not respond in time' : 'Could not reach GitLab'
    );
  }

  if (upstream.status >= 300 && upstream.status < 400) {
    await upstream.body?.cancel().catch(() => {});
    logger.warn('GitLab proxy refused upstream redirect', logContext(upstream.status));
    return errorJson(502, 'GITLAB_REDIRECT', 'GitLab responded with a redirect, which is not followed');
  }

  if (upstream.status === 401) {
    await upstream.body?.cancel().catch(() => {});
    logger.info('GitLab proxy request', logContext(401));
    return errorJson(
      502,
      'GITLAB_UNAUTHORIZED',
      'GitLab rejected the configured access token. Update it in Settings.'
    );
  }

  logger.info('GitLab proxy request', logContext(upstream.status));

  const nullBody = method === 'HEAD' || upstream.status === 204 || upstream.status === 205;
  if (nullBody) await upstream.body?.cancel().catch(() => {});

  return new Response(nullBody ? null : upstream.body, {
    status: upstream.status,
    headers: buildResponseHeaders(upstream, credentials.baseUrl),
  });
}

async function handle(request: NextRequest, context: RouteContext): Promise<Response> {
  try {
    return await proxy(request, context);
  } catch (error) {
    logger.error('GitLab proxy internal error', {
      method: request.method,
      errorName: error instanceof Error ? error.name : 'unknown',
    });
    return errorJson(500, 'INTERNAL_ERROR', 'Internal server error');
  }
}

export const GET = handle;
export const POST = handle;
export const DELETE = handle;
