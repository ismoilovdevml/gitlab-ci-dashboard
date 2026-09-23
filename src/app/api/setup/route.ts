import { NextResponse } from 'next/server';
import prisma from '@/lib/db/prisma';
import { hashPassword } from '@/lib/auth';
import { logError, logger } from '@/lib/logger';
import { validateAdminPassword } from '../../../../prisma/admin-password';

// POST /api/setup - Create initial admin user (one-time setup)
export async function POST() {
  try {
    // This endpoint is public, so there must be no fallback password anyone could guess.
    const adminPassword = process.env.ADMIN_PASSWORD;
    const passwordError = validateAdminPassword(adminPassword);
    if (passwordError || !adminPassword) {
      logger.error('Setup refused: invalid ADMIN_PASSWORD', { reason: passwordError });
      return NextResponse.json(
        { error: `${passwordError} Fix it before running setup.` },
        { status: 500 }
      );
    }

    // Check if any users exist
    const userCount = await prisma.user.count();

    if (userCount > 0) {
      return NextResponse.json(
        { error: 'Setup already completed. Users exist in database.' },
        { status: 400 }
      );
    }

    const adminUsername = process.env.ADMIN_USERNAME || 'admin';
    const adminEmail = process.env.ADMIN_EMAIL || 'admin@example.com';

    // Hash password
    const hashedPassword = await hashPassword(adminPassword);

    // Create admin user
    const admin = await prisma.user.create({
      data: {
        username: adminUsername,
        password: hashedPassword,
        email: adminEmail,
        role: 'admin',
        isActive: true,
        gitlabUrl: 'https://gitlab.com',
        gitlabToken: '',
        theme: 'dark',
        autoRefresh: true,
        refreshInterval: 10000,
        notifyPipelineFailures: true,
        notifyPipelineSuccess: false,
      },
    });

    return NextResponse.json({
      success: true,
      message: 'Admin user created successfully',
      username: admin.username,
      email: admin.email,
    });
  } catch (error) {
    logError(error, { route: '/api/setup' });
    return NextResponse.json(
      { error: 'Failed to create admin user' },
      { status: 500 }
    );
  }
}
