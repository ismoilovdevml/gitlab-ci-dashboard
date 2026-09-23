/**
 * @jest-environment node
 */
import { NextRequest } from 'next/server';
import { GET } from '../route';
import { validateCSRFToken, SESSION_COOKIE_NAME } from '@/lib/csrf';
import { TEST_SESSION_SECRET } from '@/lib/testing/csrf';

describe('GET /api/csrf', () => {
  beforeAll(() => {
    process.env.SESSION_SECRET = TEST_SESSION_SECRET;
  });

  it('returns 401 without a session instead of issuing an unbound token', async () => {
    const res = await GET(new NextRequest('http://localhost/api/csrf'));

    expect(res.status).toBe(401);
  });

  it('issues a token bound to the caller session', async () => {
    const res = await GET(
      new NextRequest('http://localhost/api/csrf', {
        headers: { cookie: `${SESSION_COOKIE_NAME}=session-a` },
      })
    );
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(res.headers.get('cache-control')).toBe('no-store');
    expect(validateCSRFToken(body.csrfToken, 'session-a')).toBe(true);
    expect(validateCSRFToken(body.csrfToken, 'session-b')).toBe(false);
  });
});
