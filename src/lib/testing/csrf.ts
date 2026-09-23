import { NextRequest } from 'next/server';
import { CSRF_HEADER, SESSION_COOKIE_NAME, generateCSRFToken } from '@/lib/csrf';

export const TEST_SESSION_SECRET = 'test-session-secret-for-csrf-tests-0123456789abcdef';
export const TEST_SESSION_TOKEN = 'test-session-token';

type CsrfMode = 'valid' | 'missing' | 'other-session' | 'garbage';

/** Builds a route-handler request carrying a session cookie and a CSRF header of the given kind. */
export function csrfRequest(
  url: string,
  method: string,
  mode: CsrfMode,
  body?: unknown
): NextRequest {
  const headers: Record<string, string> = {
    cookie: `${SESSION_COOKIE_NAME}=${TEST_SESSION_TOKEN}`,
    'content-type': 'application/json',
  };

  if (mode === 'valid') headers[CSRF_HEADER] = generateCSRFToken(TEST_SESSION_TOKEN);
  if (mode === 'other-session') headers[CSRF_HEADER] = generateCSRFToken('another-session');
  if (mode === 'garbage') headers[CSRF_HEADER] = 'not-a-token';

  return new NextRequest(url, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

export const REJECTED_MODES: CsrfMode[] = ['missing', 'other-session', 'garbage'];
