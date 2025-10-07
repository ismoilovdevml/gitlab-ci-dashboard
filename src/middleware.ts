import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

const SESSION_COOKIE_NAME = 'gitlab_dashboard_session';

// Public routes that don't require authentication
const PUBLIC_ROUTES = ['/login', '/api/auth/login'];

// API routes that don't require authentication
const PUBLIC_API_ROUTES = ['/api/auth/login', '/api/webhook/gitlab', '/api/setup', '/api/version'];

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Get session cookie
  const sessionCookie = request.cookies.get(SESSION_COOKIE_NAME);
  const isAuthenticated = !!sessionCookie?.value;

  // Check if route is public
  const isPublicRoute = PUBLIC_ROUTES.includes(pathname);
  const isPublicApiRoute = PUBLIC_API_ROUTES.some((route) =>
    pathname.startsWith(route)
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
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - public folder
     */
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
