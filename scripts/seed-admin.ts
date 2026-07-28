import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  console.log('Seeding default Super Admin user...');

  // Ensure the Super Admin role exists
  const role = await prisma.adminRole.upsert({
    where: { name: 'Super Admin' },
    update: {},
    create: {
      name: 'Super Admin',
      permissions: JSON.stringify(['ALL']),
      isSystem: true,
      description: 'System administrator with full access.'
    }
  });

  const adminEmail = 'admin@femcart.com';
  const adminPassword = await bcrypt.hash('admin123', 10);

  const adminUser = await prisma.user.upsert({
    where: { email: adminEmail },
    update: {
      password: adminPassword,
      role: 'SUPER_ADMIN',
      adminRoleId: role.id
    },
    create: {
      name: 'Super Administrator',
      email: adminEmail,
      password: adminPassword,
      role: 'SUPER_ADMIN',
      adminRoleId: role.id,
      phone: '00000000000'
    }
  });

  // Ensure the Order Manager role exists
  const managerRole = await prisma.adminRole.upsert({
    where: { name: 'Order Manager' },
    update: {},
    create: {
      name: 'Order Manager',
      permissions: JSON.stringify(['ORDERS']),
      isSystem: false,
      description: 'Can only view and manage orders.'
    }
  });

  const managerEmail = 'manager@femcart.com';
  const managerPassword = await bcrypt.hash('manager123', 10);

  const managerUser = await prisma.user.upsert({
    where: { email: managerEmail },
    update: {
      password: managerPassword,
      role: 'ADMIN',
      adminRoleId: managerRole.id
    },
    create: {
      name: 'Order Manager',
      email: managerEmail,
      password: managerPassword,
      role: 'ADMIN',
      adminRoleId: managerRole.id,
      phone: '00000000001'
    }
  });

  // Ensure a normal test user exists
  const userEmail = 'user@femcart.com';
  const userPassword = await bcrypt.hash('user123', 10);

  const normalUser = await prisma.user.upsert({
    where: { email: userEmail },
    update: {
      password: userPassword,
      role: 'USER'
    },
    create: {
      name: 'Test User',
      email: userEmail,
      password: userPassword,
      role: 'USER',
      phone: '00000000002'
    }
  });

  console.log('=============================================');
  console.log('✅ Admin, Manager & Normal users seeded successfully!');
  console.log(`[Super Admin] Email: ${adminUser.email} | Pass: admin123`);
  console.log(`[Order Mgr]   Email: ${managerUser.email} | Pass: manager123`);
  console.log(`[Normal User] Email: ${normalUser.email} | Pass: user123`);
  console.log('=============================================');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
