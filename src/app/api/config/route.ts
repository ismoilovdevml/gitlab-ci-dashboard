import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/db/prisma';
import { cacheHelpers } from '@/lib/db/redis';
import { decrypt, encrypt } from '@/lib/encryption';

// GET /api/config - Get GitLab configuration
export async function GET() {
  try {
    const config = await cacheHelpers.getOrSet(
      'gitlab:config',
      async () => {
        // Get first config or create default
        let config = await prisma.gitLabConfig.findFirst();

        if (!config) {
          const defaultToken = process.env.NEXT_PUBLIC_GITLAB_TOKEN || '';
          config = await prisma.gitLabConfig.create({
            data: {
              url: process.env.NEXT_PUBLIC_GITLAB_URL || 'https://gitlab.com',
              token: defaultToken ? encrypt(defaultToken) : '',
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

    // Decrypt token before sending to client
    const decryptedConfig = {
      ...config,
      token: config.token ? decrypt(config.token) : '',
    };

    return NextResponse.json(decryptedConfig);
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

    // Encrypt token before saving to database
    const dataToSave = {
      ...body,
      token: body.token ? encrypt(body.token) : '',
      updatedAt: new Date(),
    };

    // Get first config or create new
    const existing = await prisma.gitLabConfig.findFirst();

    let config;
    if (existing) {
      config = await prisma.gitLabConfig.update({
        where: { id: existing.id },
        data: dataToSave,
      });
    } else {
      config = await prisma.gitLabConfig.create({
        data: dataToSave,
      });
    }

    // Invalidate cache
    await cacheHelpers.invalidate('gitlab:config');

    // Return decrypted config to client
    const decryptedConfig = {
      ...config,
      token: config.token ? decrypt(config.token) : '',
    };

    return NextResponse.json(decryptedConfig);
  } catch (error) {
    console.error('Failed to save config:', error);
    return NextResponse.json(
      { error: 'Failed to save config' },
      { status: 500 }
    );
  }
}
