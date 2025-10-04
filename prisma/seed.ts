import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Starting database seed...');

  // Get admin credentials from environment
  const adminUsername = process.env.ADMIN_USERNAME || 'admin';
  const adminPassword = process.env.ADMIN_PASSWORD || 'Admin@123!Secure';
  const adminEmail = process.env.ADMIN_EMAIL || 'admin@example.com';

  // Check if admin user already exists
  const existingAdmin = await prisma.user.findUnique({
    where: { username: adminUsername },
  });

  if (existingAdmin) {
    console.log(`✅ Admin user '${adminUsername}' already exists`);
    return;
  }

  // Hash password
  const hashedPassword = await bcrypt.hash(adminPassword, 10);

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

  console.log(`✅ Admin user created successfully:`);
  console.log(`   Username: ${admin.username}`);
  console.log(`   Email: ${admin.email}`);
  console.log(`   Role: ${admin.role}`);
  console.log('');
  console.log('🔐 Login credentials:');
  console.log(`   Username: ${adminUsername}`);
  console.log(`   Password: ${adminPassword}`);
  console.log('');
  console.log('⚠️  IMPORTANT: Change the admin password after first login!');
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (e) => {
    console.error('❌ Seed failed:', e);
    await prisma.$disconnect();
    process.exit(1);
  });
