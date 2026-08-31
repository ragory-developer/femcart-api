import { z } from 'zod';
import { OrderStatus } from '@prisma/client';

export const registerPosSchema = z.object({
  name: z.string().min(2, "Name must be at least 2 characters").max(100, "Name is too long"),
  allowedDomain: z.string().optional().nullable().default('*'),
  authMode: z.enum(['SINGLE_KEY', 'DUAL_KEY']).default('DUAL_KEY'),
  webhookUrl: z.string().url("Must be a valid URL").optional().nullable().or(z.literal('')),
  permissions: z.string().optional().default('all')
});

export const updatePosSchema = z.object({
  name: z.string().min(2, "Name must be at least 2 characters").max(100, "Name is too long").optional(),
  allowedDomain: z.string().optional().nullable(),
  webhookUrl: z.string().url("Must be a valid URL").optional().nullable().or(z.literal('')),
  permissions: z.string().optional()
});

export const inventoryDeltaSyncSchema = z.object({
  items: z.array(z.object({
    sku: z.string().min(1, "SKU is required"),
    delta: z.number().int("Delta must be an integer"), // Can be negative (sales) or positive (restocks/returns)
    reason: z.string().optional(),
    referenceId: z.string().optional()
  })).min(1, "At least one item is required")
});

export const inventorySyncSchema = z.object({
  items: z.array(z.object({
    sku: z.string().min(1, "SKU is required"),
    stock: z.number().int().nonnegative("Stock must be a non-negative integer"),
    reason: z.string().optional(),
    referenceId: z.string().optional()
  })).min(1, "At least one item is required")
});

export const paginationQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(1000).default(50),
  search: z.string().optional(),
  all: z.enum(['true', 'false']).optional()
});

export const productsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(1000).default(50),
  search: z.string().optional(),
  categoryId: z.string().optional(),
  brandId: z.string().optional(),
  inStockOnly: z.enum(['true', 'false']).optional()
});

export const ordersQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(1000).default(50),
  status: z.nativeEnum(OrderStatus).optional(),
  paymentStatus: z.string().optional(),
  search: z.string().optional(),
  dateFrom: z.string().optional(),
  dateTo: z.string().optional()
});

const validStatusMap: Record<string, OrderStatus> = {
  pending: OrderStatus.PENDING,
  unpaid: OrderStatus.PENDING,
  hold: OrderStatus.PENDING,
  confirmed: OrderStatus.CONFIRMED,
  accepted: OrderStatus.CONFIRMED,
  processing: OrderStatus.PROCESSING,
  in_progress: OrderStatus.PROCESSING,
  packed: OrderStatus.PROCESSING,
  shipped: OrderStatus.SHIPPED,
  dispatched: OrderStatus.SHIPPED,
  in_transit: OrderStatus.SHIPPED,
  out_for_delivery: OrderStatus.SHIPPED,
  delivered: OrderStatus.DELIVERED,
  completed: OrderStatus.COMPLETED,
  success: OrderStatus.COMPLETED,
  paid: OrderStatus.COMPLETED,
  cancelled: OrderStatus.CANCELLED,
  canceled: OrderStatus.CANCELLED,
  void: OrderStatus.CANCELLED,
  failed: OrderStatus.CANCELLED,
  returned: OrderStatus.RETURNED,
  return_received: OrderStatus.RETURNED,
  partially_returned: OrderStatus.PARTIALLY_RETURNED,
};

export const normalizeOrderStatus = (val: string, ctx: z.RefinementCtx): OrderStatus => {
  if (!val || typeof val !== 'string') {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: `Order status is required.`
    });
    return z.NEVER;
  }
  const key = val.trim().toLowerCase();
  const mapped = validStatusMap[key] || (Object.values(OrderStatus).includes(val.toUpperCase() as OrderStatus) ? (val.toUpperCase() as OrderStatus) : null);
  if (!mapped) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: `Invalid status: "${val}". Must be one of: ${Object.values(OrderStatus).join(', ')}`
    });
    return z.NEVER;
  }
  return mapped;
};

export const updateOrderStatusSchema = z.object({
  status: z.string().transform(normalizeOrderStatus),
  paymentStatus: z.enum(['PAID', 'UNPAID', 'PARTIALLY_PAID', 'REFUNDED', 'FAILED']).optional(),
  trackingNumber: z.string().optional(),
  trackingUrl: z.string().url("Must be a valid URL").optional().nullable().or(z.literal('')),
  courierName: z.string().optional(),
  posInvoiceNumber: z.string().optional(),
  notes: z.string().optional()
});

export const cancelOrderSchema = z.object({
  reason: z.string().optional(),
  notes: z.string().optional(),
  cancel_reason: z.string().optional()
}).optional().default({});

export const singleInventorySyncSchema = z.object({
  stock: z.coerce.number().int().nonnegative().optional(),
  quantity: z.coerce.number().int().nonnegative().optional(),
  qty: z.coerce.number().int().nonnegative().optional(),
  new_stock: z.coerce.number().int().nonnegative().optional(),
  reason: z.string().optional()
});

export const batchUpdateOrderStatusSchema = z.union([
  z.object({
    orders: z.array(z.object({
      id: z.string().min(1, "Order ID is required"),
      status: z.string().transform(normalizeOrderStatus),
      paymentStatus: z.enum(['PAID', 'UNPAID', 'PARTIALLY_PAID', 'REFUNDED', 'FAILED']).optional(),
      trackingNumber: z.string().optional(),
      courierName: z.string().optional(),
      posInvoiceNumber: z.string().optional(),
      notes: z.string().optional()
    })).min(1, "At least one order is required")
  }),
  z.array(z.object({
    id: z.string().min(1, "Order ID is required"),
    status: z.string().transform(normalizeOrderStatus),
    paymentStatus: z.enum(['PAID', 'UNPAID', 'PARTIALLY_PAID', 'REFUNDED', 'FAILED']).optional(),
    trackingNumber: z.string().optional(),
    courierName: z.string().optional(),
    posInvoiceNumber: z.string().optional(),
    notes: z.string().optional()
  })).min(1, "At least one order is required")
]);

export const eventsQuerySchema = z.object({
  since: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(500).default(100)
});

export const inventoryLogsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  search: z.string().optional(),
  source: z.string().optional()
});

export const posRemoteConfigSchema = z.object({
  name: z.string().min(2, "Connection name is required"),
  targetUrl: z.string().url("Target POS URL must be a valid URL (e.g. https://pos.store.com)"),
  authType: z.enum(['QUERY_PARAM', 'HEADER', 'BASIC_AUTH', 'BEARER_TOKEN']).default('QUERY_PARAM'),
  keyParamName: z.string().default('consumer_key'),
  secretParamName: z.string().default('consumer_secret'),
  apiKey: z.string().min(1, "API Key / Consumer Key is required"),
  secretKey: z.string().optional().default(''),
  productsRoute: z.string().default('/wp-json/wc/v3/products'),
  categoriesRoute: z.string().default('/wp-json/wc/v3/products/categories'),
  brandsRoute: z.string().default('/wp-json/wc/v3/products/brands'),
  ordersRoute: z.string().default('/wp-json/wc/v3/orders')
});

export const posRemoteImportRunSchema = z.object({
  configId: z.string().optional(),
  config: posRemoteConfigSchema.optional(),
  entities: z.array(z.enum(['PRODUCTS', 'CATEGORIES', 'BRANDS', 'ORDERS'])).min(1, "Select at least one entity to import"),
  conflictStrategy: z.enum(['UPDATE_STOCK_PRICE', 'OVERWRITE_ALL', 'SKIP_EXISTING']).default('UPDATE_STOCK_PRICE'),
  dateFrom: z.string().optional(),
  limit: z.number().int().min(1).max(500).default(100)
});
