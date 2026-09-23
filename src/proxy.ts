import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

const SESSION_COOKIE_NAME = 'gitlab_dashboard_session';

// Public routes that don't require authentication
const PUBLIC_ROUTES = ['/login', '/api/auth/login'];

// API routes that don't require authentication
const PUBLIC_API_ROUTES = ['/api/auth/login', '/api/webhook/gitlab', '/api/setup', '/api/version'];

// A single path segment that cannot be a dot segment ("." or "..").
const SEGMENT = '[A-Za-z0-9][A-Za-z0-9._-]*';

// PWA files the browser fetches before anyone signs in: the service worker must not sit behind
// a redirect or registration fails on the login page. Patterns are anchored and segment-exact so
// they can never match an app page or an /api route.
const PUBLIC_STATIC_PATTERNS: RegExp[] = [
  /^\/sw\.js$/,
  /^\/swe-worker-[A-Za-z0-9_-]+\.js$/,
  /^\/workbox-[A-Za-z0-9_-]+\.js$/,
  /^\/manifest\.json$/,
  /^\/manifest\.webmanifest$/,
  /^\/favicon\.ico$/,
  /^\/robots\.txt$/,
  new RegExp(`^/icons/${SEGMENT}$`),
  new RegExp(`^/serwist/${SEGMENT}(?:/${SEGMENT})*$`),
];

export function isPublicStaticPath(pathname: string): boolean {
  return PUBLIC_STATIC_PATTERNS.some((pattern) => pattern.test(pathname));
}

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const sessionCookie = request.cookies.get(SESSION_COOKIE_NAME);
  const isAuthenticated = !!sessionCookie?.value;

  if (isPublicStaticPath(pathname)) {
    return NextResponse.next();
  }

  // Check if route is public
  const isPublicRoute = PUBLIC_ROUTES.includes(pathname);
  // Match the route itself or a sub-path, never a sibling like /api/versions.
  const isPublicApiRoute = PUBLIC_API_ROUTES.some(
    (route) => pathname === route || pathname.startsWith(`${route}/`)
  );

  // Allow public routes and API routes
  if (isPublicRoute || isPublicApiRoute) {
    // If authenticated and trying to access login, redirect to dashboard
    if (pathname === '/login' && isAuthenticated) {
      return NextResponse.redirect(new URL('/', request.url));
    }
    return NextResponse.next();
  }

  // For all other routes, check authentication
  if (!isAuthenticated) {
    // API routes return 401
    if (pathname.startsWith('/api/')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // For page routes, redirect to login
    const loginUrl = new URL('/login', request.url);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * - _next/static, _next/image (build output and image optimisation)
     * - /favicon.ico
     * - image files outside /api/ — an /api/ path ending in .png must still reach the auth check
     */
    '/((?!_next/static|_next/image|favicon\\.ico$|(?!api/).*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
