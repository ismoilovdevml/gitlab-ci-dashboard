import { NextRequest, NextResponse } from 'next/server';
import { timingSafeEqual } from 'crypto';
import prisma from '@/lib/db/prisma';
import { createLogger } from '@/lib/logger';

const logger = createLogger('CloudWebhook');

/**
 * Cloud provisioning webhook.
 * Receives events from the SaaS web platform (cidash.dev) to:
 * - Create/update Organizations when users subscribe
 * - Update plan tiers when subscriptions change
 * - Deactivate orgs when subscriptions are canceled
 *
 * Secured with HMAC signature via CLOUD_WEBHOOK_SECRET.
 */

interface CloudProvisionEvent {
  event: 'org.create' | 'org.update_plan' | 'org.deactivate' | 'org.reactivate';
  timestamp: string;
  data: {
    userId: string;       // Supabase user ID (from web platform)
    email: string;
    name?: string;
    orgSlug: string;      // URL-safe organization slug
    orgName?: string;
    plan: 'free' | 'pro' | 'enterprise';
  };
}

function validateSignature(body: string, signature: string | null): boolean {
  const secret = process.env.CLOUD_WEBHOOK_SECRET;

  if (!secret) {
    logger.warn('CLOUD_WEBHOOK_SECRET not configured — rejecting all requests');
    return false;
  }

  if (!signature) {
    return false;
  }

  try {
    const expected = Buffer.from(secret, 'utf-8');
    const received = Buffer.from(signature, 'utf-8');
    if (expected.length !== received.length) return false;
    return timingSafeEqual(expected, received);
  } catch {
    return false;
  }
}

export async function POST(request: NextRequest) {
  const body = await request.text();
  const signature = request.headers.get('x-cloud-signature');

  if (!validateSignature(body, signature)) {
    logger.warn('Invalid cloud webhook signature');
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let event: CloudProvisionEvent;
  try {
    event = JSON.parse(body);
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  logger.info(`Cloud webhook: ${event.event}`, {
    orgSlug: event.data.orgSlug,
    plan: event.data.plan,
    email: event.data.email,
  });

  try {
    switch (event.event) {
      case 'org.create':
        await handleOrgCreate(event.data);
        break;
      case 'org.update_plan':
        await handleOrgUpdatePlan(event.data);
        break;
      case 'org.deactivate':
        await handleOrgDeactivate(event.data);
        break;
      case 'org.reactivate':
        await handleOrgReactivate(event.data);
        break;
      default:
        logger.warn(`Unknown cloud event: ${event.event}`);
        return NextResponse.json({ error: 'Unknown event type' }, { status: 400 });
    }
  } catch (error) {
    logger.error(`Failed to handle ${event.event}`, {
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json({ error: 'Handler failed' }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}

async function handleOrgCreate(data: CloudProvisionEvent['data']) {
  // Find or create the local user
  let user = await prisma.user.findFirst({
    where: { email: data.email },
  });

  if (!user) {
    user = await prisma.user.create({
      data: {
        username: data.email.split('@')[0],
        password: '', // Cloud users don't use local passwords
        email: data.email,
        role: 'user',
        isActive: true,
        gitlabUrl: 'https://gitlab.com',
        gitlabToken: '',
      },
    });
    logger.info('Created local user for cloud org', { userId: user.id, email: data.email });
  }

  // Check if org already exists
  const existing = await prisma.organization.findUnique({
    where: { slug: data.orgSlug },
  });

  if (existing) {
    // Update plan if org already exists
    await prisma.organization.update({
      where: { id: existing.id },
      data: { plan: data.plan },
    });
    logger.info('Updated existing org plan', { orgId: existing.id, plan: data.plan });
    return;
  }

  // Create organization + add owner as member
  const org = await prisma.organization.create({
    data: {
      name: data.orgName || data.orgSlug,
      slug: data.orgSlug,
      plan: data.plan,
      ownerId: user.id,
      members: {
        create: {
          userId: user.id,
          role: 'owner',
        },
      },
    },
  });

  logger.info('Provisioned cloud organization', {
    orgId: org.id,
    slug: org.slug,
    plan: org.plan,
    ownerId: user.id,
  });
}

async function handleOrgUpdatePlan(data: CloudProvisionEvent['data']) {
  const org = await prisma.organization.findUnique({
    where: { slug: data.orgSlug },
  });

  if (!org) {
    // If org doesn't exist, create it
    logger.warn('Org not found for plan update, creating', { slug: data.orgSlug });
    await handleOrgCreate(data);
    return;
  }

  await prisma.organization.update({
    where: { id: org.id },
    data: { plan: data.plan },
  });

  logger.info('Updated org plan', { orgId: org.id, oldPlan: org.plan, newPlan: data.plan });
}

async function handleOrgDeactivate(data: CloudProvisionEvent['data']) {
  const org = await prisma.organization.findUnique({
    where: { slug: data.orgSlug },
  });

  if (!org) {
    logger.warn('Org not found for deactivation', { slug: data.orgSlug });
    return;
  }

  // Downgrade to free plan (preserves data but restricts features)
  await prisma.organization.update({
    where: { id: org.id },
    data: { plan: 'free' },
  });

  logger.info('Deactivated org (downgraded to free)', { orgId: org.id, slug: data.orgSlug });
}

async function handleOrgReactivate(data: CloudProvisionEvent['data']) {
  const org = await prisma.organization.findUnique({
    where: { slug: data.orgSlug },
  });

  if (!org) {
    logger.warn('Org not found for reactivation, creating', { slug: data.orgSlug });
    await handleOrgCreate(data);
    return;
  }

  await prisma.organization.update({
    where: { id: org.id },
    data: { plan: data.plan },
  });

  logger.info('Reactivated org', { orgId: org.id, plan: data.plan });
}

// GET - health check
export async function GET() {
  return NextResponse.json({
    endpoint: '/api/webhook/cloud',
    status: 'ready',
    events: ['org.create', 'org.update_plan', 'org.deactivate', 'org.reactivate'],
  });
}
