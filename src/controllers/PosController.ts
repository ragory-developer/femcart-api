import { Response, NextFunction } from 'express';
import { posService } from '../services/posService';
import { PosRequest } from '../middleware/posAuth';

export class PosController {
  
  /**
   * Ping / Health Check
   */
  public ping = async (req: PosRequest, res: Response, next: NextFunction) => {
    try {
      const result = await posService.ping(req.pos!);
      res.status(200).json(result);
    } catch (error) {
      next(error);
    }
  };

  /**
   * Export Products (Paginated & Filterable)
   */
  public getProducts = async (req: PosRequest, res: Response, next: NextFunction) => {
    try {
      const page = Number(req.query.page) || 1;
      const limit = Number(req.query.limit) || 50;
      const search = req.query.search as string | undefined;
      const categoryId = req.query.categoryId as string | undefined;
      const brandId = req.query.brandId as string | undefined;
      const inStockOnly = req.query.inStockOnly === 'true';

      const result = await posService.getProducts(page, limit, {
        search,
        categoryId,
        brandId,
        inStockOnly
      });
      res.status(200).json(result);
    } catch (error) {
      next(error);
    }
  };

  /**
   * Fast Product Lookup (By SKU, Barcode, or ID)
   */
  public getProductById = async (req: PosRequest, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;
      const result = await posService.getProductByIdOrSku(id);
      res.status(200).json(result);
    } catch (error) {
      next(error);
    }
  };

  /**
   * Export Orders (Paginated & Filterable)
   */
  public getOrders = async (req: PosRequest, res: Response, next: NextFunction) => {
    try {
      const page = Number(req.query.page) || 1;
      const limit = Number(req.query.limit) || 50;
      const status = req.query.status as any;
      const paymentStatus = req.query.paymentStatus as string | undefined;
      const search = req.query.search as string | undefined;
      const dateFrom = req.query.dateFrom as string | undefined;
      const dateTo = req.query.dateTo as string | undefined;

      const result = await posService.getOrders(page, limit, {
        status,
        paymentStatus,
        search,
        dateFrom,
        dateTo
      });
      res.status(200).json(result);
    } catch (error) {
      next(error);
    }
  };

  /**
   * Get Single Order Details
   */
  public getOrderById = async (req: PosRequest, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;
      const result = await posService.getOrderById(id);
      res.status(200).json(result);
    } catch (error) {
      next(error);
    }
  };

  /**
   * Update Order Status from POS
   */
  public updateOrderStatus = async (req: PosRequest, res: Response, next: NextFunction) => {
    try {
      const orderId = req.params.id || req.body.id || req.body.order_id || req.body.orderNumber;
      if (!orderId) {
        res.status(400).json({ success: false, message: "Order ID is required in URL or body" });
        return;
      }
      const posName = req.pos?.name || 'External POS';
      const result = await posService.updateOrderStatus(orderId, req.body, posName);
      res.status(200).json(result);
    } catch (error) {
      next(error);
    }
  };

  /**
   * Cancel Order from POS (URL param)
   */
  public cancelOrder = async (req: PosRequest, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;
      const posName = req.pos?.name || 'External POS';
      const reason = req.body?.reason || req.body?.notes || req.body?.cancel_reason || `Cancelled via ${posName}`;
      const result = await posService.cancelOrder(id, { reason }, posName);
      res.status(200).json(result);
    } catch (error) {
      next(error);
    }
  };

  /**
   * Cancel Order from POS (Body payload)
   */
  public cancelOrderByBody = async (req: PosRequest, res: Response, next: NextFunction) => {
    try {
      const orderId = req.body?.id || req.body?.orderId || req.body?.order_id || req.body?.orderNumber;
      if (!orderId) {
        res.status(400).json({ success: false, message: "Order ID is required in body (id or order_id)" });
        return;
      }
      const posName = req.pos?.name || 'External POS';
      const reason = req.body?.reason || req.body?.notes || req.body?.cancel_reason || `Cancelled via ${posName}`;
      const result = await posService.cancelOrder(orderId, { reason }, posName);
      res.status(200).json(result);
    } catch (error) {
      next(error);
    }
  };

  /**
   * Batch Update Multiple Order Statuses
   */
  public batchUpdateOrderStatus = async (req: PosRequest, res: Response, next: NextFunction) => {
    try {
      const orders = Array.isArray(req.body) ? req.body : (req.body.orders || req.body.items || []);
      const posName = req.pos?.name || 'External POS';
      const result = await posService.batchUpdateOrderStatus(orders, posName);
      res.status(200).json(result);
    } catch (error) {
      next(error);
    }
  };

  /**
   * Export Brands (Paginated or All)
   */
  public getBrands = async (req: PosRequest, res: Response, next: NextFunction) => {
    try {
      const page = Number(req.query.page) || 1;
      const limit = Number(req.query.limit) || 50;
      const search = req.query.search as string | undefined;
      const all = req.query.all === 'true';

      const result = await posService.getBrands(page, limit, search, all);
      res.status(200).json(result);
    } catch (error) {
      next(error);
    }
  };

  /**
   * Get All Brands in a single payload
   */
  public getAllBrands = async (req: PosRequest, res: Response, next: NextFunction) => {
    try {
      const search = req.query.search as string | undefined;
      const result = await posService.getBrands(1, 1000, search, true);
      res.status(200).json(result);
    } catch (error) {
      next(error);
    }
  };

  /**
   * Get Single Brand Details
   */
  public getBrandById = async (req: PosRequest, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;
      const result = await posService.getBrandById(id);
      res.status(200).json(result);
    } catch (error) {
      next(error);
    }
  };

  /**
   * Export Categories (Paginated or All)
   */
  public getCategories = async (req: PosRequest, res: Response, next: NextFunction) => {
    try {
      const page = Number(req.query.page) || 1;
      const limit = Number(req.query.limit) || 50;
      const search = req.query.search as string | undefined;
      const all = req.query.all === 'true';

      const result = await posService.getCategories(page, limit, search, all);
      res.status(200).json(result);
    } catch (error) {
      next(error);
    }
  };

  /**
   * Get All Categories in a single hierarchical payload
   */
  public getAllCategories = async (req: PosRequest, res: Response, next: NextFunction) => {
    try {
      const search = req.query.search as string | undefined;
      const result = await posService.getCategories(1, 1000, search, true);
      res.status(200).json(result);
    } catch (error) {
      next(error);
    }
  };

  /**
   * Get Single Category Details
   */
  public getCategoryById = async (req: PosRequest, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;
      const result = await posService.getCategoryById(id);
      res.status(200).json(result);
    } catch (error) {
      next(error);
    }
  };

  /**
   * Inbound Delta Sync (+/-)
   */
  public syncDeltaInventory = async (req: PosRequest, res: Response, next: NextFunction) => {
    try {
      const { items } = req.body;
      const posName = req.pos?.name || 'External POS';
      const result = await posService.syncDeltaInventory(items, posName);
      res.status(200).json(result);
    } catch (error) {
      next(error);
    }
  };

  /**
   * Inbound Absolute Inventory Sync
   */
  public syncInventory = async (req: PosRequest, res: Response, next: NextFunction) => {
    try {
      const { items } = req.body;
      const posName = req.pos?.name || 'External POS';
      const result = await posService.syncInventory(items, posName);
      res.status(200).json(result);
    } catch (error) {
      next(error);
    }
  };

  /**
   * Update Inventory By ID (Direct PUT/PATCH/POST for single item)
   */
  public updateInventoryById = async (req: PosRequest, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;
      const rawStock = req.body?.stock ?? req.body?.new_stock ?? req.body?.quantity ?? req.body?.qty ?? req.query?.stock ?? req.query?.quantity;
      const stock = parseInt(String(rawStock ?? ''), 10);
      if (isNaN(stock) || stock < 0) {
        res.status(400).json({ success: false, message: "Valid non-negative stock integer required (stock, new_stock, quantity, or qty)." });
        return;
      }
      
      const posName = req.pos?.name || 'External POS';
      const result = await posService.updateInventoryById(id, stock, posName);
      res.status(200).json(result);
    } catch (error) {
      next(error);
    }
  };

  /**
   * Handle Batch Stock Operations (Supports both batch query and batch push/update)
   */
  public handleStockBatch = async (req: PosRequest, res: Response, next: NextFunction) => {
    try {
      const body = req.body || {};
      const posName = req.pos?.name || 'External POS';

      // 1. Check if this is a Batch Query (asking for stock balances for a list of skus / pids)
      const querySkus = req.query.skus ? String(req.query.skus).split(',').map(s => s.trim()) : undefined;
      const queryPids = req.query.pids ? String(req.query.pids).split(',').map(p => p.trim()) : undefined;

      if (
        req.method === 'GET' ||
        ((Array.isArray(body.skus) || Array.isArray(body.pids) || querySkus || queryPids) &&
          !body.items &&
          !Array.isArray(body))
      ) {
        const skus = Array.isArray(body.skus) ? body.skus.map((s: any) => String(s)) : (querySkus || []);
        const pids = Array.isArray(body.pids) ? body.pids.map((p: any) => String(p)) : (queryPids || []);
        const result = await posService.queryBatchStock(skus, pids);
        res.status(200).json(result);
        return;
      }

      // 2. Otherwise treat as Batch Stock Push / Update
      let rawItems =
        body.items ||
        body.products ||
        body.data?.items ||
        body.data?.products ||
        (Array.isArray(body) ? body : []);

      if (!Array.isArray(rawItems) || rawItems.length === 0) {
        // If single object passed
        if (body.sku || body.id || body.pid) {
          rawItems = [body];
        } else {
          res.status(400).json({
            success: false,
            message: "Invalid batch payload. Expected array of items or skus/pids."
          });
          return;
        }
      }

      const result = await posService.syncInventory(rawItems, posName);
      res.status(200).json({
        success: true,
        ...result
      });
    } catch (error) {
      next(error);
    }
  };

  /**
   * Fraud Check (Mock implementation)
   */
  public fraudCheck = async (req: PosRequest, res: Response, next: NextFunction) => {
    try {
      const { phone } = req.query;
      
      if (!phone) {
        res.status(400).json({ error: 'Phone number is required' });
        return;
      }
      
      // Mock fraud check response for UI validation
      const success_ratio = Math.floor(Math.random() * 100);
      const total_parcel = Math.floor(Math.random() * 50) + 1;
      const success_parcel = Math.floor((success_ratio / 100) * total_parcel);
      const cancelled_parcel = total_parcel - success_parcel;
      
      res.status(200).json({
        phone,
        success_ratio,
        total_parcel,
        success_parcel,
        cancelled_parcel
      });
    } catch (error) {
      next(error);
    }
  };

  /**
   * Outbound Polling Events Stream
   */
  public getEvents = async (req: PosRequest, res: Response, next: NextFunction) => {
    try {
      const since = req.query.since as string | undefined;
      const limit = Number(req.query.limit) || 100;

      const result = await posService.getEvents(since, limit);
      res.status(200).json(result);
    } catch (error) {
      next(error);
    }
  };
}

export const posController = new PosController();
