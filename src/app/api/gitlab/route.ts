import { NextRequest, NextResponse } from 'next/server';
import { getOrgPrisma } from '@/lib/db/scoped-prisma';
import {
  storeOrgGitLabToken,
  getOrgGitLabConfigs,
  deleteOrgGitLabConfig,
  testGitLabConnection,
  GitLabConfigNotFoundError,
} from '@/lib/gitlab/token';
import { GitLabUrlError, normalizeGitLabBaseUrl } from '@/lib/gitlab/url';
import { logger } from '@/lib/logger';
import { requireCsrf } from '@/lib/csrf';
import { formatValidationError, orgGitLabConnectionSchema } from '@/lib/validation';

// GET /api/gitlab — list GitLab connections for the org
export async function GET() {
  try {
    const { auth } = await getOrgPrisma();
    if (!auth) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (!auth.organizationId) {
      return NextResponse.json({ error: 'No organization context' }, { status: 400 });
    }

    const configs = await getOrgGitLabConfigs(auth.organizationId);
    return NextResponse.json({ success: true, data: configs });
  } catch (error) {
    logger.error('Failed to fetch GitLab configs', { error });
    return NextResponse.json({ error: 'Failed to fetch configs' }, { status: 500 });
  }
}

// POST /api/gitlab — add or update a GitLab connection
export async function POST(request: NextRequest) {
  try {
    const csrfError = requireCsrf(request);
    if (csrfError) return csrfError;

    const { auth } = await getOrgPrisma();
    if (!auth) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (!auth.organizationId) {
      return NextResponse.json({ error: 'No organization context' }, { status: 400 });
    }

    let rawBody: unknown;
    try {
      rawBody = await request.json();
    } catch {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
    }

    const parsed = orgGitLabConnectionSchema.safeParse(rawBody);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid GitLab connection', details: formatValidationError(parsed.error) },
        { status: 400 }
      );
    }
    const { token, configId } = parsed.data;

    let url: string;
    try {
      url = normalizeGitLabBaseUrl(parsed.data.url);
    } catch (error) {
      const message = error instanceof GitLabUrlError ? error.message : 'Invalid GitLab URL';
      return NextResponse.json({ error: message }, { status: 400 });
    }

    const test = await testGitLabConnection(url, token);
    if (!test.success) {
      return NextResponse.json(
        { error: test.error || 'Connection failed' },
        { status: 422 }
      );
    }

    let config;
    try {
      config = await storeOrgGitLabToken({
        organizationId: auth.organizationId,
        url,
        token,
        configId,
      });
    } catch (error) {
      if (error instanceof GitLabConfigNotFoundError) {
        return NextResponse.json({ error: 'GitLab config not found' }, { status: 404 });
      }
      throw error;
    }

    return NextResponse.json({
      success: true,
      data: {
        id: config.id,
        url: config.url,
        tokenConfigured: true,
        username: test.username,
      },
    });
  } catch (error) {
    logger.error('Failed to save GitLab config', { error });
    return NextResponse.json({ error: 'Failed to save config' }, { status: 500 });
  }
}

// DELETE /api/gitlab — remove a GitLab connection
export async function DELETE(request: NextRequest) {
  try {
    const csrfError = requireCsrf(request);
    if (csrfError) return csrfError;

    const { auth } = await getOrgPrisma();
    if (!auth) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (!auth.organizationId) {
      return NextResponse.json({ error: 'No organization context' }, { status: 400 });
    }

    const { searchParams } = new URL(request.url);
    const configId = searchParams.get('id');

    if (!configId) {
      return NextResponse.json({ error: 'Config ID required' }, { status: 400 });
    }

    await deleteOrgGitLabConfig(configId, auth.organizationId);
    return NextResponse.json({ success: true });
  } catch (error) {
    logger.error('Failed to delete GitLab config', { error });
    return NextResponse.json({ error: 'Failed to delete config' }, { status: 500 });
  }
}
