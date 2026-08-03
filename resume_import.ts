import { PrismaClient } from '@prisma/client';
import { commitStagingToProducts } from './src/services/bulkImportService';

const prisma = new PrismaClient();

async function resume() {
  const logs = await prisma.importLog.findMany({ orderBy: { createdAt: 'desc' }, take: 1 });
  const latestLog = logs[0];
  
  if (latestLog && latestLog.status === 'committing') {
    console.log(`Resuming import for log ${latestLog.id}...`);
    try {
      const result = await commitStagingToProducts(latestLog.id, false);
      console.log('Commit Result:', result);
      
      await prisma.importLog.update({
        where: { id: latestLog.id },
        data: {
          status: 'completed',
          imported: result.committed + latestLog.imported, // Or just let the result set it if it calculates total
          failed: result.failed + latestLog.failed
        }
      });
      console.log('Import successfully completed!');
    } catch (e: any) {
      console.error('Failed to commit staging:', e);
      await prisma.importLog.update({
        where: { id: latestLog.id },
        data: { status: 'failed', errors: e.message }
      });
    }
  } else {
    console.log('No stuck import log found.');
  }
}

resume().finally(() => prisma.$disconnect());
