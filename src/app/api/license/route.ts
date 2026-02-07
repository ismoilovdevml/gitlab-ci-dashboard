import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { validateCSRFToken } from '@/lib/csrf';
import { getLicenseStatus, verifyLicense, saveLicenseKey, removeLicenseKey, TIER_FEATURES } from '@/lib/license';
import { rateLimit } from '@/lib/rate-limit';

function getClientIP(request: NextRequest): string {
  return request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
    || request.headers.get('x-real-ip')
    || 'unknown';
}

/**
 * GET /api/license - Get current license status
 */
export async function GET(request: NextRequest) {
  try {
    const ip = getClientIP(request);
    const rl = await rateLimit(`license:get:${ip}`, { limit: 30, window: 60 });
    if (!rl.success) {
      return NextResponse.json({ error: 'Too many requests' }, { status: 429 });
    }

    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const status = await getLicenseStatus();

    return NextResponse.json({
      success: true,
      data: {
        ...status,
        tiers: TIER_FEATURES,
      },
    });
  } catch (error) {
    console.error('License status error:', error);
    return NextResponse.json(
      { error: 'Failed to get license status' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/license - Activate/update license key (admin only)
 * Verifies the key and saves it to the database
 */
export async function POST(request: NextRequest) {
  try {
    const ip = getClientIP(request);
    const rl = await rateLimit(`license:post:${ip}`, { limit: 5, window: 300 });
    if (!rl.success) {
      return NextResponse.json({ error: 'Too many attempts. Try again later.' }, { status: 429 });
    }

    const user = await getCurrentUser();
    if (!user || user.role !== 'admin') {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
    }

    // CSRF check
    const csrfToken = request.headers.get('x-csrf-token');
    const sessionCookie = request.cookies.get('gitlab_dashboard_session');
    if (!csrfToken || !validateCSRFToken(csrfToken, sessionCookie?.value)) {
      return NextResponse.json({ error: 'Invalid CSRF token' }, { status: 403 });
    }

    const { licenseKey } = await request.json();

    if (!licenseKey || typeof licenseKey !== 'string') {
      return NextResponse.json({ error: 'License key is required' }, { status: 400 });
    }

    // Verify the new key before accepting
    const status = await verifyLicense(licenseKey.trim());

    if (!status.valid) {
      return NextResponse.json(
        { error: status.error || 'Invalid license key' },
        { status: 400 }
      );
    }

    // Save to database
    await saveLicenseKey(licenseKey.trim());

    return NextResponse.json({
      success: true,
      data: {
        message: 'License activated successfully',
        tier: status.tier,
        expiresAt: status.expiresAt,
        maxProjects: status.maxProjects,
        maxUsers: status.maxUsers,
        features: status.features,
      },
    });
  } catch (error) {
    console.error('License activation error:', error);
    return NextResponse.json(
      { error: 'Failed to activate license' },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/license - Remove license key (admin only)
 * Reverts to free tier
 */
export async function DELETE(request: NextRequest) {
  try {
    const ip = getClientIP(request);
    const rl = await rateLimit(`license:delete:${ip}`, { limit: 5, window: 300 });
    if (!rl.success) {
      return NextResponse.json({ error: 'Too many attempts. Try again later.' }, { status: 429 });
    }

    const user = await getCurrentUser();
    if (!user || user.role !== 'admin') {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
    }

    // CSRF check
    const csrfToken = request.headers.get('x-csrf-token');
    const sessionCookie = request.cookies.get('gitlab_dashboard_session');
    if (!csrfToken || !validateCSRFToken(csrfToken, sessionCookie?.value)) {
      return NextResponse.json({ error: 'Invalid CSRF token' }, { status: 403 });
    }

    await removeLicenseKey();

    return NextResponse.json({
      success: true,
      data: { message: 'License removed. Reverted to free tier.' },
    });
  } catch (error) {
    console.error('License removal error:', error);
    return NextResponse.json(
      { error: 'Failed to remove license' },
      { status: 500 }
    );
  }
}
