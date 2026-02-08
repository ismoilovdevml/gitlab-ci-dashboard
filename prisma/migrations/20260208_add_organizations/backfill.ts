/**
 * Backfill script: Creates a default organization for existing self-hosted installations
 * and assigns all existing data to it.
 *
 * Run with: npx tsx prisma/migrations/20260208_add_organizations/backfill.ts
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function backfill() {
  console.log('Starting organization backfill...');

  // Find the first admin user (or any user) to be the org owner
  const owner = await prisma.user.findFirst({
    where: { role: 'admin' },
    orderBy: { createdAt: 'asc' },
  }) ?? await prisma.user.findFirst({
    orderBy: { createdAt: 'asc' },
  });

  if (!owner) {
    console.log('No users found, skipping backfill. Organization will be created on first login.');
    return;
  }

  // Check if a default org already exists
  const existingOrg = await prisma.organization.findFirst();
  if (existingOrg) {
    console.log('Organization already exists:', existingOrg.slug);
    return;
  }

  // Create default organization
  const org = await prisma.organization.create({
    data: {
      name: 'Default Organization',
      slug: 'default',
      plan: 'free',
      ownerId: owner.id,
    },
  });

  console.log('Created default organization:', org.id);

  // Add all existing users as members
  const users = await prisma.user.findMany();
  for (const user of users) {
    await prisma.organizationMember.create({
      data: {
        organizationId: org.id,
        userId: user.id,
        role: user.id === owner.id ? 'owner' : (user.role === 'admin' ? 'admin' : 'member'),
      },
    });
    console.log(`  Added user ${user.username} as ${user.id === owner.id ? 'owner' : user.role}`);
  }

  // Backfill organizationId for all tenant-scoped tables
  const tables = [
    'alert_channels',
    'alert_history',
    'gitlab_config',
    'pipeline_status',
    'deployments',
    'incidents',
    'dora_metrics',
    'dashboards',
    'trend_data',
  ];

  for (const table of tables) {
    const result = await prisma.$executeRawUnsafe(
      `UPDATE "${table}" SET "organizationId" = $1 WHERE "organizationId" IS NULL`,
      org.id
    );
    console.log(`  Backfilled ${table}: ${result} rows`);
  }

  console.log('Backfill complete!');
}

backfill()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
