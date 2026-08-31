import { Router } from 'express';
import { posController } from '../controllers/PosController';
import { posAuth } from '../middleware/posAuth';
import { validate, validateQuery } from '../middleware/validate';
import {
  inventoryDeltaSyncSchema,
  inventorySyncSchema,
  paginationQuerySchema,
  productsQuerySchema,
  ordersQuerySchema,
  updateOrderStatusSchema,
  cancelOrderSchema,
  batchUpdateOrderStatusSchema,
  eventsQuerySchema
} from '../validations/posValidation';

const router = Router();

// All routes in this router require valid, ACTIVE POS Dual-Key Credentials
router.use(posAuth);

// 1. Health Check & Connection Latency Ping
router.get(['/ping', '/health'], posController.ping);

// 2. Products Catalog & Barcode Lookup
router.get('/products', validateQuery(productsQuerySchema), posController.getProducts);
router.get('/products/:id', posController.getProductById);

// 3. Orders & Order Status Updates
router.get('/orders', validateQuery(ordersQuerySchema), posController.getOrders);
router.get('/orders/:id', posController.getOrderById);
router.post('/orders/:id/status', validate(updateOrderStatusSchema), posController.updateOrderStatus);
router.patch('/orders/:id/status', validate(updateOrderStatusSchema), posController.updateOrderStatus);
router.put('/orders/:id/status', validate(updateOrderStatusSchema), posController.updateOrderStatus);
router.post(['/orders/status', '/orders/batch-status'], validate(batchUpdateOrderStatusSchema), posController.batchUpdateOrderStatus);

// 3.5 Order Cancellation (POS -> Webhook / Direct)
router.post(['/orders/:id/cancel', '/orders/:id/cancelled'], validate(cancelOrderSchema), posController.cancelOrder);
router.put(['/orders/:id/cancel', '/orders/:id/cancelled'], validate(cancelOrderSchema), posController.cancelOrder);
router.patch(['/orders/:id/cancel', '/orders/:id/cancelled'], validate(cancelOrderSchema), posController.cancelOrder);
router.post('/orders/cancel', posController.cancelOrderByBody);

// 4. Brands & All Brands Export
router.get('/brands/all', posController.getAllBrands);
router.get('/brands', validateQuery(paginationQuerySchema), posController.getBrands);
router.get('/brands/:id', posController.getBrandById);

// 5. Categories & All Categories Export
router.get('/categories/all', posController.getAllCategories);
router.get('/categories', validateQuery(paginationQuerySchema), posController.getCategories);
router.get('/categories/:id', posController.getCategoryById);

// 6. Inbound Stock Updates (POS -> Web)
router.post(['/inventory/delta', '/stock/delta'], validate(inventoryDeltaSyncSchema), posController.syncDeltaInventory);
router.post(['/inventory/sync', '/stock/sync'], validate(inventorySyncSchema), posController.syncInventory);
router.post(['/stock/batch', '/inventory/batch', '/stock/bulk', '/inventory/bulk'], posController.handleStockBatch);
router.get(['/stock/batch', '/inventory/batch'], posController.handleStockBatch);
router.put(['/inventory/:id', '/stock/:id'], posController.updateInventoryById);
router.patch(['/inventory/:id', '/stock/:id'], posController.updateInventoryById);
router.post(['/inventory/:id', '/stock/:id'], posController.updateInventoryById);

// 6.5 Fraud Check (Mock)
router.get('/courier/fraud-check', posController.fraudCheck);

// 7. Outbound Events Stream Polling (Web -> POS)
router.get('/events', validateQuery(eventsQuerySchema), posController.getEvents);

export default router;
