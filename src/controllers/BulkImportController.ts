import { Request, Response } from 'express';
import prisma from '../config/database';
import { parseSpreadsheet, importProducts, importOrders } from '../services/bulkImportService';

export class BulkImportController {
  
  /**
   * Uploads and initiates bulk product import
   */
  static async importProducts(req: Request, res: Response) {
    try {
      const file = req.file;
      if (!file) {
        return res.status(400).json({ success: false, message: 'No spreadsheet file uploaded.' });
      }

      const mapping = JSON.parse(req.body.mapping || '{}');
      const rows = parseSpreadsheet(file.buffer);

      if (!rows.length) {
        return res.status(400).json({ success: false, message: 'The spreadsheet contains no data rows.' });
      }

      // Create Import Log
      const log = await prisma.importLog.create({
        data: {
          status: 'processing',
          totalProducts: rows.length,
          imported: 0,
          failed: 0,
          startedAt: new Date(),
        }
      });

      // Run Import in background to prevent API gateway timeout
      setTimeout(async () => {
        try {
          const result = await importProducts(rows, mapping, log.id);
          await prisma.importLog.update({
            where: { id: log.id },
            data: {
              status: result.errors.length > 0 ? 'failed' : 'completed',
              finishedAt: new Date(),
              errors: result.errors.join('\n') || null
            }
          });
        } catch (err: any) {
          await prisma.importLog.update({
            where: { id: log.id },
            data: {
              status: 'failed',
              finishedAt: new Date(),
              errors: err.message
            }
          });
        }
      }, 0);

      return res.status(200).json({
        success: true,
        message: 'Product bulk import started successfully.',
        log
      });

    } catch (e: any) {
      console.error('Bulk Product Import Error:', e);
      return res.status(500).json({ success: false, message: e.message });
    }
  }

  /**
   * Uploads and initiates bulk order import
   */
  static async importOrders(req: Request, res: Response) {
    try {
      const file = req.file;
      if (!file) {
        return res.status(400).json({ success: false, message: 'No spreadsheet file uploaded.' });
      }

      const mapping = JSON.parse(req.body.mapping || '{}');
      const rows = parseSpreadsheet(file.buffer);

      if (!rows.length) {
        return res.status(400).json({ success: false, message: 'The spreadsheet contains no data rows.' });
      }

      // Create Import Log
      const log = await prisma.importLog.create({
        data: {
          status: 'processing',
          totalProducts: rows.length, // total orders in this context
          imported: 0,
          failed: 0,
          startedAt: new Date(),
        }
      });

      // Run Import in background
      setTimeout(async () => {
        try {
          const result = await importOrders(rows, mapping, log.id);
          await prisma.importLog.update({
            where: { id: log.id },
            data: {
              status: result.errors.length > 0 ? 'failed' : 'completed',
              finishedAt: new Date(),
              errors: result.errors.join('\n') || null
            }
          });
        } catch (err: any) {
          await prisma.importLog.update({
            where: { id: log.id },
            data: {
              status: 'failed',
              finishedAt: new Date(),
              errors: err.message
            }
          });
        }
      }, 0);

      return res.status(200).json({
        success: true,
        message: 'Order bulk import started successfully.',
        log
      });

    } catch (e: any) {
      console.error('Bulk Order Import Error:', e);
      return res.status(500).json({ success: false, message: e.message });
    }
  }

  /**
   * Retrieves headers from uploaded file for previewing mapping
   */
  static async getHeaders(req: Request, res: Response) {
    try {
      const file = req.file;
      if (!file) {
        return res.status(400).json({ success: false, message: 'No spreadsheet file uploaded.' });
      }

      const rows = parseSpreadsheet(file.buffer);
      if (!rows.length) {
        return res.status(400).json({ success: false, message: 'The spreadsheet is empty.' });
      }

      const headers = Object.keys(rows[0]);
      const previewRows = rows.slice(0, 5); // first 5 rows for validation preview

      return res.status(200).json({
        success: true,
        headers,
        previewRows
      });

    } catch (e: any) {
      return res.status(500).json({ success: false, message: e.message });
    }
  }

  /**
   * Retrieves historic bulk import logs
   */
  static async getLogs(req: Request, res: Response) {
    try {
      const logs = await prisma.importLog.findMany({
        orderBy: { createdAt: 'desc' },
        take: 30
      });
      return res.status(200).json({ success: true, data: logs });
    } catch (e: any) {
      return res.status(500).json({ success: false, message: e.message });
    }
  }
}
