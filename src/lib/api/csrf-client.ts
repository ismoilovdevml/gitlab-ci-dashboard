/**
 * Client-side CSRF helpers. State-changing calls to our own API must carry the
 * `x-csrf-token` header issued by GET /api/csrf for the current session.
 */

export const CSRF_HEADER = 'x-csrf-token';

// Refresh well before the server-side one hour expiry.
const REFRESH_MARGIN_MS = 5 * 60 * 1000;
const MUTATING_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

let cached: { token: string; expiresAt: number } | null = null;
let inflight: Promise<string> | null = null;

async function fetchToken(): Promise<string> {
  const res = await fetch('/api/csrf', { credentials: 'same-origin', cache: 'no-store' });
  if (!res.ok) {
    throw new Error(`Failed to obtain CSRF token (${res.status})`);
  }
  const data = (await res.json()) as { csrfToken?: string; expiresIn?: number };
  if (!data.csrfToken) {
    throw new Error('Failed to obtain CSRF token');
  }
  const lifetime = typeof data.expiresIn === 'number' ? data.expiresIn : 60 * 60 * 1000;
  cached = {
    token: data.csrfToken,
    expiresAt: Date.now() + Math.max(lifetime - REFRESH_MARGIN_MS, 0),
  };
  return data.csrfToken;
}

/** Returns a CSRF token for the current session, fetching a new one when needed. */
export async function getCsrfToken(forceRefresh = false): Promise<string> {
  if (!forceRefresh && cached && cached.expiresAt > Date.now()) {
    return cached.token;
  }
  if (!inflight) {
    inflight = fetchToken().finally(() => {
      inflight = null;
    });
  }
  return inflight;
}

/** Drops the cached token; call when the session changes (logout). */
export function clearCsrfToken(): void {
  cached = null;
}

/** Headers object for axios-style callers. */
export async function csrfHeaders(forceRefresh = false): Promise<Record<string, string>> {
  return { [CSRF_HEADER]: await getCsrfToken(forceRefresh) };
}

function isCsrfErrorBody(body: unknown): boolean {
  const code = (body as { code?: unknown } | null)?.code;
  return typeof code === 'string' && code.startsWith('CSRF_');
}

async function isCsrfRejection(res: Response): Promise<boolean> {
  if (res.status !== 403) return false;
  try {
    return isCsrfErrorBody(await res.clone().json());
  } catch {
    return false;
  }
}

/**
 * `fetch` wrapper that attaches the CSRF header to mutating requests and retries
 * once with a fresh token if the server rejects the current one (e.g. it expired
 * or the session changed).
 */
export async function csrfFetch(input: string, init: RequestInit = {}): Promise<Response> {
  const method = (init.method ?? 'GET').toUpperCase();
  if (!MUTATING_METHODS.has(method)) {
    return fetch(input, init);
  }

  const send = async (forceRefresh: boolean) => {
    const headers = new Headers(init.headers);
    headers.set(CSRF_HEADER, await getCsrfToken(forceRefresh));
    return fetch(input, { ...init, headers });
  };

  const res = await send(false);
  if (await isCsrfRejection(res)) {
    return send(true);
  }
  return res;
}

/**
 * Runs an axios-style request with CSRF headers, retrying once with a fresh
 * token when the server rejects the current one.
 */
export async function withCsrf<T>(
  request: (headers: Record<string, string>) => Promise<T>
): Promise<T> {
  try {
    return await request(await csrfHeaders());
  } catch (error) {
    const response = (error as { response?: { status?: number; data?: unknown } } | null)?.response;
    if (response?.status === 403 && isCsrfErrorBody(response.data)) {
      return request(await csrfHeaders(true));
    }
    throw error;
  }
}
