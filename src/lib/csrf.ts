import { randomBytes, createHmac, timingSafeEqual } from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import { logSecurityEvent } from './logger';

export const CSRF_HEADER = 'x-csrf-token';
export const SESSION_COOKIE_NAME = 'gitlab_dashboard_session';
export const CSRF_TOKEN_MAX_AGE_MS = 60 * 60 * 1000;

const TOKEN_LENGTH = 32;

/**
 * Returns the secret used to sign CSRF tokens. There is deliberately no fallback:
 * a well-known default would let anyone forge tokens.
 */
function getCsrfSecret(): string {
  const secret = process.env.SESSION_SECRET;
  if (!secret) {
    throw new Error(
      'SESSION_SECRET is not set. It is required to sign CSRF tokens; generate one with `openssl rand -hex 32`.'
    );
  }
  return secret;
}

/** Throws a descriptive error when the CSRF signing secret is not configured. */
export function assertCsrfConfigured(): void {
  getCsrfSecret();
}

function hmac(secret: string, data: string): string {
  return createHmac('sha256', secret).update(data).digest('hex');
}

// The token is readable by client JS, so it carries a keyed hash of the session
// token rather than the (httpOnly) session token itself.
function sessionBinding(secret: string, sessionToken: string): string {
  return hmac(secret, `session:${sessionToken}`);
}

function safeEqualHex(a: string, b: string): boolean {
  const bufA = Buffer.from(a, 'utf8');
  const bufB = Buffer.from(b, 'utf8');
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

/**
 * Generate a CSRF token bound to the given session token.
 */
export function generateCSRFToken(sessionToken: string): string {
  const secret = getCsrfSecret();
  if (!sessionToken) {
    throw new Error('A session token is required to generate a CSRF token');
  }

  const randomToken = randomBytes(TOKEN_LENGTH).toString('hex');
  const timestamp = Date.now().toString();
  const data = `${randomToken}:${timestamp}:${sessionBinding(secret, sessionToken)}`;
  const signature = hmac(secret, data);

  return Buffer.from(`${data}:${signature}`).toString('base64');
}

/**
 * Validate a CSRF token against the session it must be bound to.
 * Returns false for a missing session, expired/malformed token, a token issued
 * for another session, or a bad signature.
 */
export function validateCSRFToken(
  token: string,
  sessionToken: string | undefined,
  maxAge: number = CSRF_TOKEN_MAX_AGE_MS
): boolean {
  const secret = getCsrfSecret();
  if (!token || !sessionToken) return false;

  const parts = Buffer.from(token, 'base64').toString('utf-8').split(':');
  if (parts.length !== 4) return false;

  const [randomToken, timestamp, binding, receivedSignature] = parts;

  if (!/^\d+$/.test(timestamp)) return false;
  const tokenAge = Date.now() - parseInt(timestamp, 10);
  if (tokenAge > maxAge || tokenAge < 0) return false;

  const expectedSignature = hmac(secret, `${randomToken}:${timestamp}:${binding}`);
  if (!safeEqualHex(expectedSignature, receivedSignature)) return false;

  return safeEqualHex(sessionBinding(secret, sessionToken), binding);
}

/**
 * Guard for state-changing route handlers. Returns a 403 response when the
 * request lacks a valid `x-csrf-token` for the current session, otherwise null.
 */
export function requireCsrf(request: NextRequest): NextResponse | null {
  const token = request.headers.get(CSRF_HEADER);
  const sessionToken = request.cookies.get(SESSION_COOKIE_NAME)?.value;
  const context = { path: request.nextUrl.pathname, method: request.method };

  if (!token) {
    logSecurityEvent('Missing CSRF token', context);
    return NextResponse.json(
      { error: 'CSRF token is required', code: 'CSRF_TOKEN_MISSING' },
      { status: 403 }
    );
  }

  if (!validateCSRFToken(token, sessionToken)) {
    logSecurityEvent('Invalid CSRF token', context);
    return NextResponse.json(
      { error: 'Invalid CSRF token', code: 'CSRF_TOKEN_INVALID' },
      { status: 403 }
    );
  }

  return null;
}
