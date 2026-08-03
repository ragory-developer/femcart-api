import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function check() {
  const logs = await prisma.importLog.findMany({ orderBy: { createdAt: 'desc' }, take: 1 });
  console.log("Latest Import Log:");
  console.log(logs[0]);
}
check().finally(() => prisma.$disconnect());
