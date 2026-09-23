/**
 * @jest-environment node
 */
import { createHmac, timingSafeEqual } from 'crypto';
import { NextRequest } from 'next/server';
import {
  assertCsrfConfigured,
  generateCSRFToken,
  requireCsrf,
  validateCSRFToken,
  CSRF_HEADER,
  SESSION_COOKIE_NAME,
} from '../csrf';

jest.mock('crypto', () => {
  const actual = jest.requireActual('crypto');
  return { ...actual, timingSafeEqual: jest.fn(actual.timingSafeEqual) };
});

const SECRET = 'unit-test-session-secret-0123456789abcdef0123456789abcdef';
const SESSION = 'session-a';

function decode(token: string): string[] {
  return Buffer.from(token, 'base64').toString('utf-8').split(':');
}

function sign(parts: string[]): string {
  const data = parts.join(':');
  const signature = createHmac('sha256', SECRET).update(data).digest('hex');
  return Buffer.from(`${data}:${signature}`).toString('base64');
}

describe('csrf', () => {
  const originalSecret = process.env.SESSION_SECRET;

  beforeEach(() => {
    process.env.SESSION_SECRET = SECRET;
    jest.clearAllMocks();
  });

  afterAll(() => {
    process.env.SESSION_SECRET = originalSecret;
  });

  describe('secret handling', () => {
    it('refuses to sign or verify without SESSION_SECRET instead of using a default', () => {
      delete process.env.SESSION_SECRET;

      expect(() => assertCsrfConfigured()).toThrow(/SESSION_SECRET is not set/);
      expect(() => generateCSRFToken(SESSION)).toThrow(/SESSION_SECRET is not set/);
      expect(() => validateCSRFToken('x', SESSION)).toThrow(/SESSION_SECRET is not set/);
    });

    it('rejects tokens signed with the old hardcoded fallback secret', () => {
      const [random, ts, binding] = decode(generateCSRFToken(SESSION));
      const data = `${random}:${ts}:${binding}`;
      const forged = createHmac('sha256', 'default-csrf-secret-change-me').update(data).digest('hex');
      const token = Buffer.from(`${data}:${forged}`).toString('base64');

      expect(validateCSRFToken(token, SESSION)).toBe(false);
    });

    it('rejects tokens after the secret rotates', () => {
      const token = generateCSRFToken(SESSION);
      process.env.SESSION_SECRET = `${SECRET}-rotated`;

      expect(validateCSRFToken(token, SESSION)).toBe(false);
    });
  });

  describe('session binding', () => {
    it('accepts a token for the session it was issued to', () => {
      expect(validateCSRFToken(generateCSRFToken(SESSION), SESSION)).toBe(true);
    });

    it('rejects a token issued to another session', () => {
      expect(validateCSRFToken(generateCSRFToken('session-b'), SESSION)).toBe(false);
    });

    it('rejects any token when the request has no session', () => {
      expect(validateCSRFToken(generateCSRFToken(SESSION), undefined)).toBe(false);
    });

    it('does not issue tokens without a session', () => {
      expect(() => generateCSRFToken('')).toThrow(/session token is required/);
    });

    it('rejects a correctly signed legacy "anonymous" token', () => {
      const token = sign(['abc', Date.now().toString(), 'anonymous']);

      expect(validateCSRFToken(token, SESSION)).toBe(false);
    });

    it('does not embed the session token in the client-visible token', () => {
      const decoded = Buffer.from(generateCSRFToken(SESSION), 'base64').toString('utf-8');

      expect(decoded).not.toContain(SESSION);
    });
  });

  describe('validation', () => {
    it('compares signature and session binding with crypto.timingSafeEqual', () => {
      validateCSRFToken(generateCSRFToken(SESSION), SESSION);

      expect(timingSafeEqual).toHaveBeenCalledTimes(2);
    });

    it('rejects a tampered signature', () => {
      const parts = decode(generateCSRFToken(SESSION));
      parts[3] = parts[3].replace(/.$/, (c) => (c === '0' ? '1' : '0'));
      const token = Buffer.from(parts.join(':')).toString('base64');

      expect(validateCSRFToken(token, SESSION)).toBe(false);
    });

    it('rejects a signature of the wrong length without throwing', () => {
      const parts = decode(generateCSRFToken(SESSION));
      const token = Buffer.from([...parts.slice(0, 3), 'abc'].join(':')).toString('base64');

      expect(validateCSRFToken(token, SESSION)).toBe(false);
    });

    it('rejects expired and future-dated tokens', () => {
      const [random, , binding] = decode(generateCSRFToken(SESSION));

      expect(validateCSRFToken(sign([random, String(Date.now() - 2 * 60 * 60 * 1000), binding]), SESSION)).toBe(false);
      expect(validateCSRFToken(sign([random, String(Date.now() + 60 * 1000), binding]), SESSION)).toBe(false);
    });

    it('rejects malformed tokens', () => {
      expect(validateCSRFToken('', SESSION)).toBe(false);
      expect(validateCSRFToken('not-base64-at-all', SESSION)).toBe(false);
      expect(validateCSRFToken(sign(['a', 'not-a-number', 'b']), SESSION)).toBe(false);
    });
  });

  describe('requireCsrf', () => {
    function request(headers: Record<string, string>): NextRequest {
      return new NextRequest('http://localhost/api/channels', { method: 'POST', headers });
    }

    it('returns 403 CSRF_TOKEN_MISSING without a header', async () => {
      const res = requireCsrf(request({ cookie: `${SESSION_COOKIE_NAME}=${SESSION}` }));

      expect(res?.status).toBe(403);
      expect(await res?.json()).toMatchObject({ code: 'CSRF_TOKEN_MISSING' });
    });

    it('returns 403 CSRF_TOKEN_INVALID for a token from another session', async () => {
      const res = requireCsrf(
        request({
          cookie: `${SESSION_COOKIE_NAME}=${SESSION}`,
          [CSRF_HEADER]: generateCSRFToken('session-b'),
        })
      );

      expect(res?.status).toBe(403);
      expect(await res?.json()).toMatchObject({ code: 'CSRF_TOKEN_INVALID' });
    });

    it('returns 403 when the session cookie is missing', () => {
      const res = requireCsrf(request({ [CSRF_HEADER]: generateCSRFToken(SESSION) }));

      expect(res?.status).toBe(403);
    });

    it('returns null for a valid token bound to the session cookie', () => {
      const res = requireCsrf(
        request({
          cookie: `${SESSION_COOKIE_NAME}=${SESSION}`,
          [CSRF_HEADER]: generateCSRFToken(SESSION),
        })
      );

      expect(res).toBeNull();
    });
  });
});
