import { NextResponse } from 'next/server';
import { generateCSRFToken } from '@/lib/csrf';
import { cookies } from 'next/headers';

/**
 * GET /api/csrf
 * Generate and return a CSRF token for the current session
 */
export async function GET() {
  try {
    const cookieStore = await cookies();
    const sessionToken = cookieStore.get('gitlab_dashboard_session')?.value;

    // Generate CSRF token with session ID
    const csrfToken = generateCSRFToken(sessionToken);

    return NextResponse.json({
      csrfToken,
      expiresIn: 3600000, // 1 hour in milliseconds
    });
  } catch (error) {
    console.error('Failed to generate CSRF token:', error);
    return NextResponse.json(
      { error: 'Failed to generate CSRF token' },
      { status: 500 }
    );
  }
}
