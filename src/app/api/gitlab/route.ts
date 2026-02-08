import { NextRequest, NextResponse } from 'next/server';
import { getOrgPrisma } from '@/lib/db/scoped-prisma';
import {
  storeOrgGitLabToken,
  getOrgGitLabConfigs,
  deleteOrgGitLabConfig,
  testGitLabConnection,
} from '@/lib/gitlab/token';
import { logger } from '@/lib/logger';

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
    const { auth } = await getOrgPrisma();
    if (!auth) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (!auth.organizationId) {
      return NextResponse.json({ error: 'No organization context' }, { status: 400 });
    }

    const body = await request.json();
    const { url, token, configId } = body;

    if (!url || !token) {
      return NextResponse.json({ error: 'URL and token are required' }, { status: 400 });
    }

    // Test connection first
    const test = await testGitLabConnection(url, token);
    if (!test.success) {
      return NextResponse.json(
        { error: test.error || 'Connection failed' },
        { status: 422 }
      );
    }

    // Store encrypted
    const config = await storeOrgGitLabToken({
      organizationId: auth.organizationId,
      url,
      token,
      configId,
    });

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
