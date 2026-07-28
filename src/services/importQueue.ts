/**
 * In-process import task manager.
 * Each ImportTask record corresponds to one batch of products.
 * Tasks can be individually started and paused.
 */

import prisma from '../config/database';
import { importCategories, importProduct } from './importService';
import { WCSetting, wordPressService } from './wordpressService';

/** Set of currently running task IDs */
const runningTasks = new Set<string>();
/** Set of tasks that have been requested to cancel/pause */
const cancelRequests = new Set<string>();
/** Queue of task IDs waiting to run */
const taskQueue: { setting: WCSetting, taskId: string, productIds?: number[] }[] = [];
/** Max concurrent tasks to prevent backend freeze */
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
  // Start the task (no await so we can check for more if MAX > 1)
  executeTask(next.setting, next.taskId, next.productIds);
}

/**
 * Start or resume a specific import task (batch).
 * Kicks off processing in the background (no await).
 */
export async function startImportTask(
  setting: WCSetting,
  taskId: string,
  productIds?: number[]
): Promise<void> {
  const existing = await prisma.importTask.findUnique({ where: { id: taskId } });
  if (!existing) throw new Error('Task not found');

  if (runningTasks.has(taskId) || taskQueue.some(q => q.taskId === taskId)) {
    throw new Error('This task is already in queue or running');
  }

  // Update status to 'queued'
  await prisma.importTask.update({
    where: { id: taskId },
    data: { status: 'queued' },
  });

  taskQueue.push({ setting, taskId, productIds });
  processQueue();
}

/** Internal execution wrapper */
async function executeTask(setting: WCSetting, taskId: string, productIds?: number[]) {
  const task = await prisma.importTask.findUnique({ where: { id: taskId } });
  if (!task) return;

  // Set to running now that it's starting
  await prisma.importTask.update({
    where: { id: taskId },
    data: { status: 'running', startedAt: task.startedAt ?? new Date() },
  });

  runningTasks.add(taskId);
  cancelRequests.delete(taskId);

  try {
    await runTask(task, setting, productIds);
  } catch (err: any) {
    console.error(`[Task ${taskId.slice(0, 6)}] Crashed:`, err.message);
    await prisma.importTask
      .update({ where: { id: taskId }, data: { status: 'failed', finishedAt: new Date() } })
      .catch(() => {});
  } finally {
    runningTasks.delete(taskId);
    cancelRequests.delete(taskId);
    processQueue(); // Check for next in queue
  }
}

async function runTask(
  task: any,
  setting: WCSetting,
  productIds?: number[]
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
    // Keep logs manageable (last 200 lines to prevent memory leaks)
    if (details.length > 200) details.shift();
    console.log(`[Task:${task.id.slice(0, 6)}] ${msg}`);
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
    logFn(`🚀 Starting: ${task.name}`);
    logFn(`Fetching category map from WooCommerce...`);
    const catMap = await importCategories(setting);
    logFn(`✔️ ${catMap.size} categories cached.`);

    let wcProducts: any[] = [];

    if (productIds && productIds.length > 0) {
      // Selective import mode
      logFn(`Fetching ${productIds.length} specific product(s)...`);
      for (const pid of productIds) {
        if (cancelRequests.has(task.id)) break;
        try {
          const product = await wordPressService.fetchProductById(setting, pid);
          wcProducts.push(product);
        } catch (err: any) {
          failed++;
          logFn(`❌ Failed to fetch product ${pid}: ${err.message}`);
        }
      }
    } else {
      // Batch-page import mode
      logFn(`Fetching page ${task.pageNumber} from WooCommerce (${task.perPage} per page)...`);
      try {
        wcProducts = await wordPressService.fetchProducts(setting, task.pageNumber, task.perPage);
        logFn(`✔️ Fetched ${wcProducts.length} products.`);
      } catch (err: any) {
        logFn(`❌ Batch fetch failed: ${err.message}`);
        throw err;
      }
    }

    for (const wcProduct of wcProducts) {
      if (cancelRequests.has(task.id)) {
        logFn(`⏸️ Pause requested. Stopping after current product.`);
        break;
      }
      try {
        await importProduct(wcProduct, setting, catMap, logFn);
        imported++;
      } catch (err: any) {
        failed++;
        logFn(`❌ Error on "${wcProduct.name}": ${err.message}`);
      }
      
      // Flush logs only every 5 products to reduce DB load
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
