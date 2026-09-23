import { NextRequest, NextResponse } from 'next/server';
import { generateCSRFToken, CSRF_TOKEN_MAX_AGE_MS, SESSION_COOKIE_NAME } from '@/lib/csrf';
import { logError } from '@/lib/logger';

/**
 * GET /api/csrf
 * Issue a CSRF token bound to the caller's session.
 */
export async function GET(request: NextRequest) {
  try {
    const sessionToken = request.cookies.get(SESSION_COOKIE_NAME)?.value;
    if (!sessionToken) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    return NextResponse.json(
      {
        csrfToken: generateCSRFToken(sessionToken),
        expiresIn: CSRF_TOKEN_MAX_AGE_MS,
      },
      { headers: { 'Cache-Control': 'no-store' } }
    );
  } catch (error) {
    logError(error, { path: '/api/csrf' });
    return NextResponse.json(
      { error: 'Failed to generate CSRF token' },
      { status: 500 }
    );
  }
}
