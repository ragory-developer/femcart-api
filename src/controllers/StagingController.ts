import { Request, Response } from 'express';
import prisma from '../config/database';
import { commitStagingToProducts } from '../services/bulkImportService';

export class StagingController {
  
  /**
   * Fetch paginated staging rows for a given import log
   */
  static async getStagingRows(req: Request, res: Response) {
    try {
      const { logId } = req.params;
      const page = parseInt(req.query.page as string) || 1;
      const limit = parseInt(req.query.limit as string) || 20;
      const filterStatus = req.query.status as string; // 'VALID' | 'INVALID' | 'IMPORTED' | 'ALL'

      const where: any = { importLogId: logId };
      if (filterStatus && filterStatus !== 'ALL') {
        where.status = filterStatus;
      }

      const total = await prisma.importStagingRow.count({ where });
      const rows = await prisma.importStagingRow.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { id: 'asc' } // Process in order
      });

      return res.status(200).json({
        success: true,
        data: rows,
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit)
        }
      });
    } catch (e: any) {
      return res.status(500).json({ success: false, message: e.message });
    }
  }

  /**
   * Update a specific staging row (inline edit)
   */
  static async updateStagingRow(req: Request, res: Response) {
    try {
      const { rowId } = req.params;
      const data = req.body; // e.g. { name: 'New Name', price: 100 }

      // Re-validate simple rules on update
      const fieldErrors: any = {};
      if (data.name !== undefined && !data.name && !data.parentSku) {
        fieldErrors.name = "Name is required for parent products";
      }
      if (data.price !== undefined) {
        const price = parseFloat(data.price);
        if (isNaN(price)) fieldErrors.price = "Price must be a number";
        else if (price < 0) fieldErrors.price = "Price cannot be negative";
      }

      const status = Object.keys(fieldErrors).length > 0 ? 'INVALID' : 'VALID';

      const updated = await prisma.importStagingRow.update({
        where: { id: rowId },
        data: {
          ...data,
          status,
          errors: status === 'INVALID' ? fieldErrors : null
        }
      });

      return res.status(200).json({ success: true, data: updated });
    } catch (e: any) {
      return res.status(500).json({ success: false, message: e.message });
    }
  }

  /**
   * Commit all VALID staging rows to actual Product/Variant tables
   */
  static async commitStaging(req: Request, res: Response) {
    try {
      const { logId } = req.params;
      const { includeInvalid } = req.body;

      // Ensure the log exists
      const log = await prisma.importLog.findUnique({ where: { id: logId } });
      if (!log) {
        return res.status(404).json({ success: false, message: 'Import log not found.' });
      }

      // Update log to committing
      await prisma.importLog.update({
        where: { id: logId },
        data: { status: 'committing' }
      });

      // Run commit in background
      setTimeout(async () => {
        try {
          const result = await commitStagingToProducts(logId, !!includeInvalid);
          await prisma.importLog.update({
            where: { id: logId },
            data: {
              status: 'completed',
              imported: result.committed, // replace or increment? Let's just set it to committed count
              failed: result.failed
            }
          });
        } catch (err: any) {
          await prisma.importLog.update({
            where: { id: logId },
            data: { status: 'failed', errors: err.message }
          });
        }
      }, 0);

      return res.status(200).json({
        success: true,
        message: 'Commit process started in background.'
      });

    } catch (e: any) {
      return res.status(500).json({ success: false, message: e.message });
    }
  }

  /**
   * Download INVALID staging rows as a CSV
   */
  static async downloadErrors(req: Request, res: Response) {
    try {
      const { logId } = req.params;
      
      const invalidRows = await prisma.importStagingRow.findMany({
        where: { importLogId: logId, status: 'INVALID' }
      });

      if (!invalidRows.length) {
        return res.status(404).json({ success: false, message: 'No invalid rows found.' });
      }

      // We generate a simple CSV string
      const headers = ['id', 'name', 'sku', 'price', 'errors'];
      const csvRows = invalidRows.map(r => {
        const rowErrors = r.errors ? JSON.stringify(r.errors).replace(/"/g, '""') : '';
        return `"${r.id}","${r.name || ''}","${r.sku || ''}","${r.price || ''}","${rowErrors}"`;
      });
      
      const csv = [headers.join(','), ...csvRows].join('\n');

      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename=errors-${logId}.csv`);
      return res.send(csv);

    } catch (e: any) {
      return res.status(500).json({ success: false, message: e.message });
    }
  }

  /**
   * Cancel and delete an import log and all its staging rows
   */
  static async cancelStaging(req: Request, res: Response) {
    try {
      const { logId } = req.params;
      
      const log = await prisma.importLog.findUnique({ where: { id: logId } });
      if (!log) {
        return res.status(404).json({ success: false, message: 'Import log not found.' });
      }

      await prisma.importStagingRow.deleteMany({ where: { importLogId: logId } });
      await prisma.importLog.delete({ where: { id: logId } });

      return res.status(200).json({ success: true, message: 'Import cancelled successfully.' });
    } catch (e: any) {
      return res.status(500).json({ success: false, message: e.message });
    }
  }
}
