import { NextRequest, NextResponse } from 'next/server';
import { serialize } from 'cookie';
import { createClient } from '@supabase/supabase-js';
import prisma from '@/lib/db/prisma';
import { createSession } from '@/lib/auth';
import { generateCSRFToken } from '@/lib/csrf';
import { createLogger, logSecurityEvent, logError } from '@/lib/logger';
import { rateLimit } from '@/lib/rate-limit';
import { getDefaultOrg } from '@/lib/org/scope';

const logger = createLogger('CloudSession');
const SESSION_COOKIE_NAME = 'gitlab_dashboard_session';

/**
 * Get client IP from request
 */
function getClientIp(request: NextRequest): string {
  const forwarded = request.headers.get('x-forwarded-for');
  const realIp = request.headers.get('x-real-ip');

  if (forwarded) {
    const firstIp = forwarded.split(',')[0];
    return firstIp ? firstIp.trim() : 'unknown';
  }

  if (realIp) {
    return realIp;
  }

  return 'unknown';
}

/**
 * POST /api/auth/cloud-session
 *
 * Bridges Supabase authentication to the existing session system.
 * Receives a Supabase access token, validates it, finds/creates a local user,
 * ensures a default organization exists, and creates a session cookie.
 *
 * This allows all existing session-based routes to work unchanged in cloud mode.
 */
async function cloudSessionHandler(request: NextRequest): Promise<NextResponse> {
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseServiceKey) {
    logger.error('SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY not configured');
    return NextResponse.json(
      { error: 'Cloud authentication not configured' },
      { status: 500 }
    );
  }

  const body = await request.json();
  const { accessToken } = body;

  if (!accessToken || typeof accessToken !== 'string') {
    return NextResponse.json(
      { error: 'Missing or invalid accessToken' },
      { status: 400 }
    );
  }

  const ip = getClientIp(request);
  const userAgent = request.headers.get('user-agent') || 'unknown';

  // Validate the access token against Supabase using the service role key
  const supabase = createClient(supabaseUrl, supabaseServiceKey);
  const { data: { user: supabaseUser }, error: supabaseError } =
    await supabase.auth.getUser(accessToken);

  if (supabaseError || !supabaseUser) {
    logSecurityEvent('Cloud session failed - invalid Supabase token', {
      ip,
      userAgent,
      error: supabaseError?.message,
    });

    return NextResponse.json(
      { error: 'Invalid or expired token' },
      { status: 401 }
    );
  }

  // Find or create local user linked to the Supabase user (same logic as supabase-adapter)
  let localUser = await prisma.user.findFirst({
    where: { email: supabaseUser.email },
  });

  if (!localUser) {
    // Auto-provision local user for cloud mode
    localUser = await prisma.user.create({
      data: {
        username: supabaseUser.email?.split('@')[0] || supabaseUser.id.slice(0, 8),
        password: '', // No password for cloud users (Supabase handles auth)
        email: supabaseUser.email,
        role: 'user',
        isActive: true,
        gitlabUrl: 'https://gitlab.com',
        gitlabToken: '',
      },
    });
    logger.info('Auto-provisioned local user for cloud session', {
      userId: localUser.id,
      email: localUser.email,
    });
  }

  // Check if user is active
  if (!localUser.isActive) {
    logSecurityEvent('Cloud session failed - account disabled', {
      userId: localUser.id,
      email: localUser.email,
      ip,
    });

    return NextResponse.json(
      { error: 'Account is disabled' },
      { status: 403 }
    );
  }

  // Find or create default organization for the user
  let defaultOrg = await getDefaultOrg(localUser.id);

  if (!defaultOrg) {
    // Create a default personal organization
    const orgSlug = (localUser.email?.split('@')[0] || localUser.username)
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .substring(0, 48);

    defaultOrg = await prisma.organization.create({
      data: {
        name: `${localUser.username}'s Organization`,
        slug: `${orgSlug}-${localUser.id.slice(0, 6)}`,
        plan: 'free',
        ownerId: localUser.id,
        members: {
          create: {
            userId: localUser.id,
            role: 'owner',
          },
        },
      },
    });

    logger.info('Created default organization for cloud user', {
      userId: localUser.id,
      orgId: defaultOrg.id,
      slug: defaultOrg.slug,
    });
  }

  // Create a session (same as login route)
  const session = await createSession(localUser.id);

  // Generate CSRF token
  const csrfToken = generateCSRFToken(session.token);

  // Update last login timestamp
  await prisma.user.update({
    where: { id: localUser.id },
    data: {
      lastLoginAt: new Date(),
      lastActivityAt: new Date(),
    },
  });

  // Set session cookie (same pattern as login route)
  const isHttps =
    request.headers.get('x-forwarded-proto') === 'https' ||
    request.url.startsWith('https://');

  const cookie = serialize(SESSION_COOKIE_NAME, session.token, {
    httpOnly: true,
    secure: isHttps,
    sameSite: 'lax',
    maxAge: 7 * 24 * 60 * 60, // 7 days
    path: '/',
  });

  // Log successful cloud session creation
  logger.info('Cloud session created', {
    userId: localUser.id,
    email: localUser.email,
    orgId: defaultOrg.id,
    ip,
    userAgent,
  });

  // Return success with user info
  const response = NextResponse.json({
    success: true,
    user: {
      id: localUser.id,
      username: localUser.username,
      email: localUser.email,
      role: localUser.role,
      theme: localUser.theme,
    },
    csrfToken,
  });

  response.headers.set('Set-Cookie', cookie);

  return response;
}

// Wrap with rate limiting for security
export async function POST(request: NextRequest): Promise<NextResponse> {
  const ip = getClientIp(request);
  const identifier = `${ip}:/api/auth/cloud-session`;

  // Rate limiting (same as login route)
  const rateLimitResult = await rateLimit(identifier, {
    limit: 10,
    window: 60,
  });

  if (!rateLimitResult.success) {
    logSecurityEvent('Rate limit exceeded', {
      ip,
      path: '/api/auth/cloud-session',
      remaining: rateLimitResult.remaining,
    });

    return NextResponse.json(
      {
        error: 'Too many requests',
        code: 'RATE_LIMIT_EXCEEDED',
        retryAfter: Math.ceil((rateLimitResult.reset - Date.now()) / 1000),
      },
      {
        status: 429,
        headers: {
          'Retry-After': Math.ceil(
            (rateLimitResult.reset - Date.now()) / 1000
          ).toString(),
        },
      }
    );
  }

  // Call handler
  try {
    return await cloudSessionHandler(request);
  } catch (error) {
    logError(error, {
      method: 'POST',
      path: '/api/auth/cloud-session',
      ip,
    });

    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
