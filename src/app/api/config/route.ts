import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/db/prisma';
import { cacheHelpers } from '@/lib/db/redis';

// GET /api/config - Get GitLab configuration
export async function GET() {
  try {
    const config = await cacheHelpers.getOrSet(
      'gitlab:config',
      async () => {
        // Get first config or create default
        let config = await prisma.gitLabConfig.findFirst();

        if (!config) {
          config = await prisma.gitLabConfig.create({
            data: {
              url: process.env.NEXT_PUBLIC_GITLAB_URL || 'https://gitlab.com',
              token: process.env.NEXT_PUBLIC_GITLAB_TOKEN || '',
              autoRefresh: true,
              refreshInterval: 10000,
              theme: 'dark',
              notifyPipelineFailures: true,
              notifyPipelineSuccess: false,
            },
          });
        }

        return config;
      },
      60 // Cache for 60 seconds
    );

    return NextResponse.json(config);
  } catch (error) {
    console.error('Failed to fetch config:', error);
    return NextResponse.json(
      { error: 'Failed to fetch config' },
      { status: 500 }
    );
  }
}

// POST /api/config - Update GitLab configuration
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    // Get first config or create new
    const existing = await prisma.gitLabConfig.findFirst();

    let config;
    if (existing) {
      config = await prisma.gitLabConfig.update({
        where: { id: existing.id },
        data: {
          ...body,
          updatedAt: new Date(),
        },
      });
    } else {
      config = await prisma.gitLabConfig.create({
        data: body,
      });
    }

    // Invalidate cache
    await cacheHelpers.invalidate('gitlab:config');

    return NextResponse.json(config);
  } catch (error) {
    console.error('Failed to save config:', error);
    return NextResponse.json(
      { error: 'Failed to save config' },
      { status: 500 }
    );
  }
}
