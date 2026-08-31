/**
 * Invi POS Dedicated Task Queue & Background Worker
 * Manages task queuing, concurrency control, individual batch execution,
 * and live streaming logs for Invi POS migration.
 */

import prisma from '../config/database';
import { importInviProductItem } from './inviImportService';
import { CacheService } from '../core/redis/CacheService';
import { KeyFactory } from '../core/redis/KeyFactory';

const runningTasks = new Set<string>();
const cancelRequests = new Set<string>();
const taskQueue: Array<{ taskId: string }> = [];
const MAX_CONCURRENT_TASKS = 1;

export function isTaskRunning(taskId: string): boolean {
  return runningTasks.has(taskId);
}

export function isTaskQueued(taskId: string): boolean {
  return taskQueue.some((q) => q.taskId === taskId);
}

export function requestCancelTask(taskId: string): void {
  cancelRequests.add(taskId);
}

async function processQueue() {
  if (runningTasks.size >= MAX_CONCURRENT_TASKS) return;
  if (taskQueue.length === 0) return;

  const next = taskQueue.shift()!;
  executeTask(next.taskId);
}

/**
 * Starts or resumes a specific Invi POS import batch task.
 */
export async function startInviTask(taskId: string): Promise<void> {
  const existing = await prisma.importTask.findUnique({ where: { id: taskId } });
  if (!existing) throw new Error('Task not found');

  if (runningTasks.has(taskId) || taskQueue.some((q) => q.taskId === taskId)) {
    throw new Error('This task is already in queue or running');
  }

  await prisma.importTask.update({
    where: { id: taskId },
    data: { status: 'queued' }
  });

  taskQueue.push({ taskId });
  processQueue();
}

/**
 * Enqueues all pending, paused, or failed Invi POS tasks.
 */
export async function startAllInviTasks(): Promise<{ queuedCount: number }> {
  const tasks = await prisma.importTask.findMany({
    where: {
      entityType: 'INVI_PRODUCTS',
      status: { in: ['pending', 'paused', 'failed'] }
    },
    orderBy: { pageNumber: 'asc' }
  });

  for (const t of tasks) {
    if (!runningTasks.has(t.id) && !taskQueue.some((q) => q.taskId === t.id)) {
      await prisma.importTask.update({
        where: { id: t.id },
        data: { status: 'queued' }
      });
      taskQueue.push({ taskId: t.id });
    }
  }

  processQueue();
  return { queuedCount: tasks.length };
}

/**
 * Pauses a running or queued Invi POS task.
 */
export async function pauseInviTask(taskId: string): Promise<void> {
  cancelRequests.add(taskId);

  // If in queue, remove immediately
  const queueIndex = taskQueue.findIndex((q) => q.taskId === taskId);
  if (queueIndex !== -1) {
    taskQueue.splice(queueIndex, 1);
    await prisma.importTask.update({
      where: { id: taskId },
      data: { status: 'paused' }
    });
  }
}

/**
 * Clears all Invi POS tasks.
 */
export async function clearInviTasks(): Promise<void> {
  taskQueue.length = 0;
  runningTasks.clear();
  cancelRequests.clear();

  await prisma.importTask.deleteMany({
    where: { entityType: 'INVI_PRODUCTS' }
  });
}

/**
 * Internal execution wrapper for an Invi POS batch.
 */
async function executeTask(taskId: string) {
  const task = await prisma.importTask.findUnique({ where: { id: taskId } });
  if (!task) return;

  await prisma.importTask.update({
    where: { id: taskId },
    data: { status: 'running', startedAt: task.startedAt ?? new Date() }
  });

  runningTasks.add(taskId);
  cancelRequests.delete(taskId);

  try {
    await runInviTask(task);
  } catch (err: any) {
    console.error(`[InviTask ${taskId.slice(0, 6)}] Crashed:`, err.message);
    await prisma.importTask
      .update({
        where: { id: taskId },
        data: { status: 'failed', finishedAt: new Date() }
      })
      .catch(() => {});
  } finally {
    runningTasks.delete(taskId);
    cancelRequests.delete(taskId);

    // Invalidate caches on batch completion
    try {
      await CacheService.invalidateAllCatalog();
    } catch {
      // ignore
    }

    processQueue();
  }
}

async function runInviTask(task: any): Promise<void> {
  let imported = (task.imported as number) || 0;
  let failed = (task.failed as number) || 0;
  let logEntries: string[] = [];
  let items: any[] = [];

  try {
    if (typeof task.details === 'string') {
      const parsed = JSON.parse(task.details);
      if (parsed && typeof parsed === 'object') {
        if (Array.isArray(parsed.items)) {
          items = parsed.items;
        }
        if (Array.isArray(parsed.logs)) {
          logEntries = [...parsed.logs];
        }
        if (Array.isArray(parsed)) {
          if (parsed.length > 0 && typeof parsed[0] === 'object') {
            items = parsed;
          }
        }
      }
    }
  } catch {
    items = [];
    logEntries = [];
  }

  const logFn = (msg: string) => {
    const ts = new Date().toLocaleTimeString('en-GB');
    logEntries.push(`[${ts}] ${msg}`);
    if (logEntries.length > 250) logEntries.shift();
  };

  const flushLogs = async (isFinal: boolean = false, finalStatus?: string) => {
    try {
      const updateData: any = {
        imported,
        failed,
        details: JSON.stringify({ items, logs: logEntries })
      };
      if (isFinal) {
        updateData.status = finalStatus || (failed === 0 ? 'done' : 'done');
        updateData.finishedAt = new Date();
      }
      await prisma.importTask.update({
        where: { id: task.id },
        data: updateData
      });
    } catch {
      // ignore
    }
  };

  logFn(`🚀 Starting ${task.name}...`);
  logFn(`📦 Total items in this batch: ${items.length}`);

  for (let i = 0; i < items.length; i++) {
    if (cancelRequests.has(task.id)) {
      logFn(`⏸️ Batch paused by user.`);
      await flushLogs(true, 'paused');
      return;
    }

    const item = items[i];
    logFn(`▶️ [${i + 1}/${items.length}] Processing item: "${item.name || item.sku || 'Product'}"...`);

    try {
      const result = await importInviProductItem(item, logFn);
      if (result === 'created' || result === 'updated') {
        imported++;
      }
    } catch (err: any) {
      failed++;
      logFn(`❌ Failed: ${err.message || 'Database write error'}`);
    }

    // Flush progress to database
    await flushLogs();
  }

  logFn(`🎉 Batch finished! Imported: ${imported}, Failed: ${failed}`);
  await flushLogs(true, failed > 0 && imported === 0 ? 'failed' : 'done');
}
