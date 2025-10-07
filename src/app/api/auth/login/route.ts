import { NextRequest, NextResponse } from 'next/server';
import { serialize } from 'cookie';
import prisma from '@/lib/db/prisma';
import { verifyPassword, createSession } from '@/lib/auth';
import { errorResponse } from '@/lib/api-handler';
import { loginSchema } from '@/lib/validation';
import { logger, logSecurityEvent, logError } from '@/lib/logger';
import { generateCSRFToken } from '@/lib/csrf';
import { rateLimit } from '@/lib/rate-limit';

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

async function loginHandler(request: NextRequest): Promise<NextResponse> {
  const body = await request.json();
  const ip = getClientIp(request);
  const userAgent = request.headers.get('user-agent') || 'unknown';

  // Validate input with Zod
  const validation = loginSchema.safeParse(body);

  if (!validation.success) {
    logSecurityEvent('Login validation failed', {
      ip,
      errors: validation.error.issues,
    });

    return errorResponse('Invalid input', 400, 'VALIDATION_ERROR');
  }

  const { username, password } = validation.data;

  // Find user by username
  const user = await prisma.user.findUnique({
    where: { username },
  });

  if (!user) {
    // Log failed attempt
    logSecurityEvent('Login failed - user not found', {
      username,
      ip,
      userAgent,
    });

    // Generic error to prevent username enumeration
    return errorResponse('Invalid username or password', 401, 'INVALID_CREDENTIALS');
  }

  // Check if user is active
  if (!user.isActive) {
    logSecurityEvent('Login failed - account disabled', {
      username,
      userId: user.id,
      ip,
    });

    return errorResponse('Account is disabled', 403, 'ACCOUNT_DISABLED');
  }

  // Verify password
  const isValid = await verifyPassword(password, user.password);

  if (!isValid) {
    logSecurityEvent('Login failed - invalid password', {
      username,
      userId: user.id,
      ip,
      userAgent,
    });

    return errorResponse('Invalid username or password', 401, 'INVALID_CREDENTIALS');
  }

  // Create session
  const session = await createSession(user.id);

  // Generate CSRF token
  const csrfToken = generateCSRFToken(session.token);

  // Update last login timestamp
  await prisma.user.update({
    where: { id: user.id },
    data: {
      lastLoginAt: new Date(),
      lastActivityAt: new Date(),
    },
  });

  // Set session cookie
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

  // Log successful login
  logger.info('Login successful', {
    username,
    userId: user.id,
    ip,
    userAgent,
  });

  // Return success with user data (without password)
  const response = NextResponse.json({
    success: true,
    user: {
      id: user.id,
      username: user.username,
      email: user.email,
      role: user.role,
      theme: user.theme,
    },
    csrfToken, // Include CSRF token in response
  });

  response.headers.set('Set-Cookie', cookie);

  return response;
}

// Wrap with security features manually for Next.js 15 compatibility
export async function POST(request: NextRequest): Promise<NextResponse> {
  const ip = getClientIp(request);
  const identifier = `${ip}:/api/auth/login`;

  // Rate limiting
  const rateLimitResult = await rateLimit(identifier, {
    limit: 5,
    window: 60,
  });

  if (!rateLimitResult.success) {
    logSecurityEvent('Rate limit exceeded', {
      ip,
      path: '/api/auth/login',
      remaining: rateLimitResult.remaining,
    });

    return NextResponse.json(
      {
        error: 'Too many login attempts',
        code: 'RATE_LIMIT_EXCEEDED',
        retryAfter: Math.ceil((rateLimitResult.reset - Date.now()) / 1000),
      },
      {
        status: 429,
        headers: {
          'Retry-After': Math.ceil((rateLimitResult.reset - Date.now()) / 1000).toString(),
        },
      }
    );
  }

  // Call handler
  try {
    return await loginHandler(request);
  } catch (error) {
    logError(error, {
      method: 'POST',
      path: '/api/auth/login',
      ip,
    });

    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
