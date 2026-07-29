import prisma from '../config/database';
import { shopifyImportService } from './shopifyImportService';
import { ShopifySetting, shopifyService } from './shopifyService';

const runningTasks = new Set<string>();
const cancelRequests = new Set<string>();
const taskQueue: { setting: ShopifySetting, taskId: string, productIds?: number[], imageStorageStrategy?: 'LOCAL' | 'DIRECT_LINK' | 'AWS_S3', pageInfo?: string }[] = [];
const MAX_CONCURRENT_TASKS = 1;

export function isTaskRunning(taskId: string): boolean {
  return runningTasks.has(taskId);
}

export function isTaskQueued(taskId: string): boolean {
  return taskQueue.some(q => q.taskId === taskId);
}

export function requestCancelTask(taskId: string): void {
  cancelRequests.add(taskId);
}

async function processQueue() {
  if (runningTasks.size >= MAX_CONCURRENT_TASKS) return;
  if (taskQueue.length === 0) return;

  const next = taskQueue.shift()!;
  executeTask(next.setting, next.taskId, next.productIds, next.imageStorageStrategy, next.pageInfo);
}

export async function startShopifyImportTask(
  setting: ShopifySetting,
  taskId: string,
  productIds?: number[],
  imageStorageStrategy: 'LOCAL' | 'DIRECT_LINK' | 'AWS_S3' = 'AWS_S3',
  pageInfo?: string
): Promise<void> {
  const existing = await prisma.importTask.findUnique({ where: { id: taskId } });
  if (!existing) throw new Error('Task not found');

  if (runningTasks.has(taskId) || taskQueue.some(q => q.taskId === taskId)) {
    throw new Error('This task is already in queue or running');
  }

  await prisma.importTask.update({
    where: { id: taskId },
    data: { status: 'queued' },
  });

  taskQueue.push({ setting, taskId, productIds, imageStorageStrategy, pageInfo });
  processQueue();
}

async function executeTask(setting: ShopifySetting, taskId: string, productIds?: number[], imageStorageStrategy?: 'LOCAL' | 'DIRECT_LINK' | 'AWS_S3', pageInfo?: string) {
  const task = await prisma.importTask.findUnique({ where: { id: taskId } });
  if (!task) return;

  await prisma.importTask.update({
    where: { id: taskId },
    data: { status: 'running', startedAt: task.startedAt ?? new Date() },
  });

  runningTasks.add(taskId);
  cancelRequests.delete(taskId);

  try {
    await runTask(task, setting, productIds, imageStorageStrategy, pageInfo);
  } catch (err: any) {
    console.error(`[Task ${taskId.slice(0, 6)}] Crashed:`, err.message);
    await prisma.importTask
      .update({ where: { id: taskId }, data: { status: 'failed', finishedAt: new Date() } })
      .catch(() => {});
  } finally {
    runningTasks.delete(taskId);
    cancelRequests.delete(taskId);
    processQueue();
  }
}

async function runTask(
  task: any,
  setting: ShopifySetting,
  productIds?: number[],
  imageStorageStrategy?: 'LOCAL' | 'DIRECT_LINK' | 'AWS_S3',
  pageInfo?: string
): Promise<void> {
  let imported = task.imported as number;
  let failed = task.failed as number;
  let details: string[] = [];
  try {
    if (typeof task.details === 'string') {
      details = JSON.parse(task.details);
    } else if (Array.isArray(task.details)) {
      details = task.details;
    }
  } catch (e) {
    details = [];
  }
  
  const logFn = (msg: string) => {
    const ts = new Date().toLocaleTimeString('en-GB');
    details.push(`[${ts}] ${msg}`);
    if (details.length > 200) details.shift();
    console.log(`[Shopify Task:${task.id.slice(0, 6)}] ${msg}`);
  };

  const flushLogs = async () => {
    try {
      await prisma.importTask.update({
        where: { id: task.id },
        data: { imported, failed, details: JSON.stringify(details) },
      });
    } catch (e) { /* ignore flush errors during run */ }
  };

  try {
    logFn(`🚀 Starting Shopify Import: ${task.name}`);
    
    // We only support Products right now as per requirements
    logFn(`Fetching batch from Shopify...`);
    let shopifyProducts: any[] = [];
    
    try {
      const result = await shopifyService.fetchProducts(setting, task.perPage, pageInfo);
      shopifyProducts = result.products;
      logFn(`✔️ Fetched ${shopifyProducts.length} products.`);
    } catch (err: any) {
      logFn(`❌ Batch fetch failed: ${err.message}`);
      throw err;
    }

    for (const p of shopifyProducts) {
      if (cancelRequests.has(task.id)) {
        logFn(`⏸️ Pause requested. Stopping after current product.`);
        break;
      }
      try {
        await shopifyImportService.processProduct(p, imageStorageStrategy ?? 'AWS_S3');
        imported++;
      } catch (err: any) {
        failed++;
        logFn(`❌ Error on "${p.title}": ${err.message}`);
      }
      
      if (imported % 5 === 0 || failed % 5 === 0) {
        await flushLogs();
      }
    }

    const paused = cancelRequests.has(task.id);
    const finalStatus = paused ? 'paused' : 'done';
    logFn(paused ? `⏸️ Task paused.` : `✅ Task complete! Imported: ${imported}, Failed: ${failed}`);

    await prisma.importTask.update({
      where: { id: task.id },
      data: { status: finalStatus, imported, failed, details: JSON.stringify(details), finishedAt: new Date() },
    });
  } catch (err: any) {
    logFn(`💥 Task failed: ${err.message}`);
    await prisma.importTask.update({
      where: { id: task.id },
      data: { status: 'failed', imported, failed, details: JSON.stringify(details), finishedAt: new Date() },
    });
  } finally {
    runningTasks.delete(task.id);
    cancelRequests.delete(task.id);
  }
}
