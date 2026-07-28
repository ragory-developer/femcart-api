import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('Seeding admin roles...');

  // 1. Super Admin Role
  const superAdmin = await prisma.adminRole.upsert({
    where: { name: 'Super Admin' },
    update: {
      permissions: JSON.stringify(['ALL']),
      isSystem: true,
      description: 'System administrator with full access to all modules.'
    },
    create: {
      name: 'Super Admin',
      permissions: JSON.stringify(['ALL']),
      isSystem: true,
      description: 'System administrator with full access to all modules.'
    }
  });
  console.log(`Upserted role: ${superAdmin.name}`);

  // 2. Order Manager Role
  const orderManager = await prisma.adminRole.upsert({
    where: { name: 'Order Manager' },
    update: {
      permissions: JSON.stringify(['ORDERS']),
      isSystem: false,
      description: 'Can only view and manage orders.'
    },
    create: {
      name: 'Order Manager',
      permissions: JSON.stringify(['ORDERS']),
      isSystem: false,
      description: 'Can only view and manage orders.'
    }
  });
  console.log(`Upserted role: ${orderManager.name}`);

  console.log('Finished seeding roles.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
