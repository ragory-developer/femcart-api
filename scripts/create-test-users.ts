import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  console.log('Creating test users...');
  
  const hash = await bcrypt.hash('password123', 10);
  
  await prisma.user.upsert({
    where: { email: 'admin@femcart.com' },
    update: { password: hash, role: 'SUPER_ADMIN' },
    create: {
      email: 'admin@femcart.com',
      password: hash,
      role: 'SUPER_ADMIN',
      name: 'Super Admin',
      phone: '1234567890'
    }
  });

  const managerRole = await prisma.adminRole.findUnique({
    where: { name: 'Order Manager' }
  });

  if (managerRole) {
    await prisma.user.upsert({
      where: { email: 'manager@femcart.com' },
      update: { password: hash, role: 'ADMIN', adminRoleId: managerRole.id },
      create: {
        email: 'manager@femcart.com',
        password: hash,
        role: 'ADMIN',
        name: 'Order Manager',
        phone: '0987654321',
        adminRoleId: managerRole.id
      }
    });
  }

  console.log('Users created successfully.');
}

main().catch(console.error).finally(() => prisma.$disconnect());
