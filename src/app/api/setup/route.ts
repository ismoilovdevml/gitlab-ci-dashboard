import { NextResponse } from 'next/server';
import prisma from '@/lib/db/prisma';
import { hashPassword } from '@/lib/auth';

// POST /api/setup - Create initial admin user (one-time setup)
export async function POST() {
  try {
    // Check if any users exist
    const userCount = await prisma.user.count();

    if (userCount > 0) {
      return NextResponse.json(
        { error: 'Setup already completed. Users exist in database.' },
        { status: 400 }
      );
    }

    // Get admin credentials from environment or request
    const adminUsername = process.env.ADMIN_USERNAME || 'admin';
    const adminPassword = process.env.ADMIN_PASSWORD || 'Admin123Secure';
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
    console.error('Setup error:', error);
    return NextResponse.json(
      { error: 'Failed to create admin user' },
      { status: 500 }
    );
  }
}
