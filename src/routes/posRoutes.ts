import { Router, Request, Response, NextFunction } from 'express';
import { posAuth, PosRequest } from '../middleware/posAuth';
import { posService } from '../services/posService';

const router = Router();

// Protect all POS routes with Consumer Key authentication
router.use(posAuth);

// 1. Health / Latency Ping
router.get(['/ping', '/health'], (req: PosRequest, res: Response) => {
  res.json({
    status: 'healthy',
    message: 'Pong! POS connection is authenticated and operational.',
    serverTime: new Date().toISOString(),
    connection: req.pos
  });
});

// 2. Products Catalog
router.get('/products', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = await posService.getProducts({
      page: Number(req.query.page) || 1,
      limit: Number(req.query.limit) || 50,
      search: req.query.search as string,
      inStockOnly: req.query.inStockOnly === 'true'
    });
    res.json(data);
  } catch (err) {
    next(err);
  }
});

// 3. Single Product Lookup (by SKU or ID)
router.get('/products/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const product = await posService.getProductByIdOrSku(req.params.id);
    if (!product) {
      return res.status(404).json({ success: false, message: 'Product not found' });
    }
    res.json(product);
  } catch (err) {
    next(err);
  }
});

// 4. Orders List
router.get('/orders', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = await posService.getOrders({
      status: req.query.status as string,
      page: Number(req.query.page) || 1,
      limit: Number(req.query.limit) || 50
    });
    res.json(data);
  } catch (err) {
    next(err);
  }
});

// 5. Single Order Details
router.get('/orders/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const order = await posService.getOrderById(req.params.id);
    if (!order) {
      return res.status(404).json({ success: false, message: 'Order not found' });
    }
    res.json(order);
  } catch (err) {
    next(err);
  }
});

// 6. Update Order Status
router.all('/orders/:id/status', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const orderId = req.params.id || req.body?.id || req.body?.order_id;
    if (!orderId) {
      return res.status(400).json({ success: false, message: 'Order ID is required' });
    }
    const status = req.body?.status;
    if (!status) {
      return res.status(400).json({ success: false, message: 'status field is required in payload' });
    }

    const result = await posService.updateOrderStatus(orderId, req.body);
    res.json(result);
  } catch (err: any) {
    if (err.message && err.message.includes('not found')) {
      return res.status(404).json({ success: false, message: err.message });
    }
    next(err);
  }
});

// 7. Cancel Order
router.all('/orders/:id/cancel', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const orderId = req.params.id || req.body?.id || req.body?.order_id;
    if (!orderId) {
      return res.status(400).json({ success: false, message: 'Order ID is required' });
    }
    const reason = req.body?.reason || req.body?.notes || 'Cancelled via POS';
    const result = await posService.cancelOrder(orderId, reason);
    res.json(result);
  } catch (err: any) {
    if (err.message && err.message.includes('not found')) {
      return res.status(404).json({ success: false, message: err.message });
    }
    next(err);
  }
});

// 8. Batch Stock Sync
router.post(['/stock/batch', '/inventory/batch'], async (req: Request, res: Response, next: NextFunction) => {
  try {
    const items = req.body?.items || req.body;
    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ success: false, message: 'items array is required' });
    }
    const result = await posService.batchUpdateStock(items);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

// 9. Update Single Stock Balance
router.all(['/stock/:id', '/inventory/:id'], async (req: Request, res: Response, next: NextFunction) => {
  try {
    const targetId = req.params.id || req.body?.id || req.body?.sku;
    if (!targetId) {
      return res.status(400).json({ success: false, message: 'Product ID or SKU is required' });
    }

    const rawStock = req.body?.stock ?? req.body?.quantity ?? req.query?.stock;
    const stock = parseInt(String(rawStock ?? ''), 10);

    if (isNaN(stock) || stock < 0) {
      return res.status(400).json({ success: false, message: 'Valid non-negative stock integer required.' });
    }

    const result = await posService.updateStock(targetId, stock);
    res.json(result);
  } catch (err: any) {
    if (err.message && err.message.includes('not found')) {
      return res.status(404).json({ success: false, message: err.message });
    }
    next(err);
  }
});

// 10. OEM Brands List & Export
router.get('/brands', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await posService.exportAllBrands();
    res.json(result);
  } catch (err) {
    next(err);
  }
});

router.get('/brands/all', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await posService.exportAllBrands();
    res.json(result);
  } catch (err) {
    next(err);
  }
});

// 11. Categories List & Export
router.get('/categories', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await posService.exportAllCategories();
    res.json(result);
  } catch (err) {
    next(err);
  }
});

router.get('/categories/all', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await posService.exportAllCategories();
    res.json(result);
  } catch (err) {
    next(err);
  }
});

// 12. Outbound Events Polling
router.get('/events', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await posService.getEvents({
      since: req.query.since as string,
      limit: Number(req.query.limit) || 20
    });
    res.json(result);
  } catch (err) {
    next(err);
  }
});

export default router;
