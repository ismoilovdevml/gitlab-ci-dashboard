import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/db/prisma';
import { cacheHelpers } from '@/lib/db/redis';
import { getCurrentUser } from '@/lib/auth';
import { requireCsrf } from '@/lib/csrf';
import { logger } from '@/lib/logger';
import { decryptToken, encryptToken } from '@/lib/gitlab/token';
import { GitLabUrlError, normalizeGitLabBaseUrl } from '@/lib/gitlab/url';
import { formatValidationError, userGitLabConfigUpdateSchema } from '@/lib/validation';

// Placeholders the UI may echo back instead of a real token; never store them.
const MASKED_TOKEN_VALUES = new Set(['***MASKED***', '***']);

/** Decrypt a stored token. Legacy plaintext values pass through unchanged. */
function readStoredToken(stored: string | null | undefined, userId: string): string | null {
  if (!stored) return '';
  try {
    return decryptToken(stored);
  } catch (error) {
    logger.error('Failed to decrypt stored GitLab token', {
      userId,
      error: error instanceof Error ? error.message : 'unknown',
    });
    return null;
  }
}

// GET /api/config - Get user's GitLab configuration
export async function GET(request: NextRequest) {
  try {
    const user = await getCurrentUser();

    if (!user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    // Check if token should be unmasked (for API usage, not for display)
    const { searchParams } = new URL(request.url);
    const unmask = searchParams.get('unmask') === 'true';

    const token = readStoredToken(user.gitlabToken, user.id);
    if (token === null && unmask) {
      return NextResponse.json(
        { error: 'Stored GitLab token could not be decrypted. Check TOKEN_ENCRYPTION_KEY or re-enter the token in Settings.' },
        { status: 500 }
      );
    }

    // Return user's config
    // SECURITY: Only unmask token for internal API calls, not for UI display
    return NextResponse.json({
      url: user.gitlabUrl,
      token: unmask ? token : (user.gitlabToken ? '***MASKED***' : ''),
      tokenConfigured: !!user.gitlabToken,
      tokenLength: token?.length || 0,
      autoRefresh: user.autoRefresh,
      refreshInterval: user.refreshInterval,
      theme: user.theme,
      notifyPipelineFailures: user.notifyPipelineFailures,
      notifyPipelineSuccess: user.notifyPipelineSuccess,
    });
  } catch (error) {
    logger.error('Failed to fetch config', {
      error: error instanceof Error ? error.message : 'unknown',
    });
    return NextResponse.json(
      { error: 'Failed to fetch config' },
      { status: 500 }
    );
  }
}

// POST /api/config - Update user's GitLab configuration
export async function POST(request: NextRequest) {
  try {
    const user = await getCurrentUser();

    if (!user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const csrfError = requireCsrf(request);
    if (csrfError) return csrfError;

    let rawBody: unknown;
    try {
      rawBody = await request.json();
    } catch {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
    }

    const parsed = userGitLabConfigUpdateSchema.safeParse(rawBody);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid configuration', details: formatValidationError(parsed.error) },
        { status: 400 }
      );
    }
    const body = parsed.data;

    let gitlabUrl: string | undefined;
    if (body.url !== undefined) {
      try {
        gitlabUrl = normalizeGitLabBaseUrl(body.url);
      } catch (error) {
        const message = error instanceof GitLabUrlError ? error.message : 'Invalid GitLab URL';
        return NextResponse.json({ error: message }, { status: 400 });
      }
    }

    let gitlabToken: string | undefined;
    if (body.token !== undefined && !MASKED_TOKEN_VALUES.has(body.token)) {
      const trimmed = body.token.trim();
      gitlabToken = trimmed ? encryptToken(trimmed) : '';
    }

    // Update user's config (undefined fields are left unchanged)
    const updatedUser = await prisma.user.update({
      where: { id: user.id },
      data: {
        gitlabUrl,
        gitlabToken,
        autoRefresh: body.autoRefresh,
        refreshInterval: body.refreshInterval,
        theme: body.theme,
        notifyPipelineFailures: body.notifyPipelineFailures,
        notifyPipelineSuccess: body.notifyPipelineSuccess,
        updatedAt: new Date(),
      },
    });

    // Invalidate user cache
    await cacheHelpers.invalidate(`user:${user.id}:config`);

    const savedToken = readStoredToken(updatedUser.gitlabToken, user.id);

    return NextResponse.json({
      url: updatedUser.gitlabUrl,
      token: updatedUser.gitlabToken ? '***MASKED***' : '',
      tokenConfigured: !!updatedUser.gitlabToken,
      tokenLength: savedToken?.length || 0,
      autoRefresh: updatedUser.autoRefresh,
      refreshInterval: updatedUser.refreshInterval,
      theme: updatedUser.theme,
      notifyPipelineFailures: updatedUser.notifyPipelineFailures,
      notifyPipelineSuccess: updatedUser.notifyPipelineSuccess,
    });
  } catch (error) {
    logger.error('Failed to save config', {
      error: error instanceof Error ? error.message : 'unknown',
    });
    return NextResponse.json(
      { error: 'Failed to save config' },
      { status: 500 }
    );
  }
}
