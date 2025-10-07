import { NextRequest, NextResponse } from 'next/server';
import { ZodError } from 'zod';
import { logger, logError, logSecurityEvent } from './logger';
import { rateLimit } from './rate-limit';
import { validateCSRFToken } from './csrf';

export interface ApiError {
  error: string;
  details?: unknown;
  code?: string;
}

export type ApiHandler = (
  request: NextRequest,
  context?: { params?: Record<string, string> }
) => Promise<NextResponse>;

export interface HandlerOptions {
  rateLimit?: {
    limit: number;
    window: number;
  };
  requireAuth?: boolean;
  requireCSRF?: boolean;
  allowedMethods?: string[];
}

/**
 * Get client IP from request
 */
function getClientIp(request: NextRequest): string {
  const forwarded = request.headers.get('x-forwarded-for');
  const realIp = request.headers.get('x-real-ip');

  if (forwarded) {
    return forwarded.split(',')[0].trim();
  }

  if (realIp) {
    return realIp;
  }

  return 'unknown';
}

/**
 * Get session ID from request
 */
function getSessionId(request: NextRequest): string | undefined {
  const sessionCookie = request.cookies.get('gitlab_dashboard_session');
  return sessionCookie?.value;
}

/**
 * Create error response
 */
function createErrorResponse(
  error: string,
  status: number,
  details?: unknown,
  code?: string
): NextResponse {
  const response: ApiError = { error };

  if (details && process.env.NODE_ENV !== 'production') {
    response.details = details;
  }

  if (code) {
    response.code = code;
  }

  return NextResponse.json(response, { status });
}

/**
 * Handle validation errors
 */
function handleValidationError(error: ZodError): NextResponse {
  const errors = error.issues.map((err) => ({
    path: err.path.join('.'),
    message: err.message,
  }));

  return createErrorResponse(
    'Validation failed',
    400,
    { errors },
    'VALIDATION_ERROR'
  );
}

/**
 * Handle rate limit
 */
async function handleRateLimit(
  request: NextRequest,
  options?: HandlerOptions['rateLimit']
): Promise<NextResponse | null> {
  if (!options) return null;

  const ip = getClientIp(request);
  const identifier = `${ip}:${request.nextUrl.pathname}`;

  const result = await rateLimit(identifier, {
    limit: options.limit,
    window: options.window,
  });

  if (!result.success) {
    logSecurityEvent('Rate limit exceeded', {
      ip,
      path: request.nextUrl.pathname,
      remaining: result.remaining,
    });

    return NextResponse.json(
      {
        error: 'Too many requests',
        code: 'RATE_LIMIT_EXCEEDED',
        retryAfter: Math.ceil((result.reset - Date.now()) / 1000),
      },
      {
        status: 429,
        headers: {
          'X-RateLimit-Limit': options.limit.toString(),
          'X-RateLimit-Remaining': result.remaining.toString(),
          'X-RateLimit-Reset': result.reset.toString(),
          'Retry-After': Math.ceil((result.reset - Date.now()) / 1000).toString(),
        },
      }
    );
  }

  return null;
}

/**
 * Handle CSRF validation
 */
function handleCSRFValidation(
  request: NextRequest,
  requireCSRF: boolean
): NextResponse | null {
  if (!requireCSRF) return null;

  // Skip CSRF for GET requests
  if (request.method === 'GET') return null;

  const csrfToken = request.headers.get('x-csrf-token');
  const sessionId = getSessionId(request);

  if (!csrfToken) {
    logSecurityEvent('Missing CSRF token', {
      path: request.nextUrl.pathname,
      method: request.method,
    });

    return createErrorResponse(
      'CSRF token is required',
      403,
      undefined,
      'CSRF_TOKEN_MISSING'
    );
  }

  if (!validateCSRFToken(csrfToken, sessionId)) {
    logSecurityEvent('Invalid CSRF token', {
      path: request.nextUrl.pathname,
      method: request.method,
    });

    return createErrorResponse(
      'Invalid CSRF token',
      403,
      undefined,
      'CSRF_TOKEN_INVALID'
    );
  }

  return null;
}

/**
 * Handle method validation
 */
function handleMethodValidation(
  request: NextRequest,
  allowedMethods?: string[]
): NextResponse | null {
  if (!allowedMethods || allowedMethods.length === 0) {
    return null;
  }

  if (!allowedMethods.includes(request.method)) {
    return createErrorResponse(
      `Method ${request.method} not allowed`,
      405,
      { allowedMethods },
      'METHOD_NOT_ALLOWED'
    );
  }

  return null;
}

/**
 * Global error handler wrapper for API routes
 */
export function withErrorHandler(
  handler: ApiHandler,
  options: HandlerOptions = {}
): ApiHandler {
  return async (request: NextRequest, context?: { params?: Record<string, string> }) => {
    const startTime = Date.now();
    const ip = getClientIp(request);

    try {
      // Log incoming request
      logger.info('API Request', {
        method: request.method,
        path: request.nextUrl.pathname,
        ip,
      });

      // Check rate limit
      if (options.rateLimit) {
        const rateLimitResponse = await handleRateLimit(request, options.rateLimit);
        if (rateLimitResponse) return rateLimitResponse;
      }

      // Check allowed methods
      const methodResponse = handleMethodValidation(request, options.allowedMethods);
      if (methodResponse) return methodResponse;

      // Check CSRF token
      const csrfResponse = handleCSRFValidation(request, options.requireCSRF || false);
      if (csrfResponse) return csrfResponse;

      // Execute handler
      const response = await handler(request, context);

      // Log successful response
      const duration = Date.now() - startTime;
      logger.info('API Response', {
        method: request.method,
        path: request.nextUrl.pathname,
        status: response.status,
        duration: `${duration}ms`,
      });

      return response;
    } catch (error) {
      const duration = Date.now() - startTime;

      // Handle Zod validation errors
      if (error instanceof ZodError) {
        logger.warn('Validation error', {
          path: request.nextUrl.pathname,
          errors: error.issues,
        });
        return handleValidationError(error);
      }

      // Handle other errors
      logError(error, {
        method: request.method,
        path: request.nextUrl.pathname,
        ip,
        duration: `${duration}ms`,
      });

      // Return generic error in production
      if (process.env.NODE_ENV === 'production') {
        return createErrorResponse(
          'Internal server error',
          500,
          undefined,
          'INTERNAL_ERROR'
        );
      }

      // Return detailed error in development
      return createErrorResponse(
        error instanceof Error ? error.message : 'Unknown error',
        500,
        error instanceof Error ? error.stack : String(error),
        'INTERNAL_ERROR'
      );
    }
  };
}

/**
 * Create success response
 */
export function successResponse<T>(
  data: T,
  status: number = 200,
  headers?: Record<string, string>
): NextResponse {
  return NextResponse.json({ success: true, data }, { status, headers });
}

/**
 * Create error response helper
 */
export function errorResponse(
  error: string,
  status: number = 400,
  code?: string
): NextResponse {
  return createErrorResponse(error, status, undefined, code);
}
