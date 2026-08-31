import { Router, Request, Response } from 'express';
import prisma from '../config/database';
import { authenticate, authorize } from '../middleware/auth';
import { CacheService } from '../core/redis/CacheService';
import { KeyFactory } from '../core/redis/KeyFactory';
import { generateInviTasks, importInviProductItem } from '../services/inviImportService';
import {
  startInviTask,
  pauseInviTask,
  startAllInviTasks,
  clearInviTasks
} from '../services/inviImportQueue';

const router = Router();

router.use(authenticate);
router.use(authorize('SUPER_ADMIN', 'ADMIN'));

// In-memory / temporary config fallback store
let savedRemoteConfigs: any[] = [];

/**
 * Smart Fallback Helper: Extracts first non-empty value from an object matching any known alias.
 */
export function extractField(item: any, keys: string[]): any {
  if (!item || typeof item !== 'object') return undefined;
  for (const k of keys) {
    if (item[k] !== undefined && item[k] !== null && item[k] !== '') {
      return item[k];
    }
  }
  return undefined;
}

/**
 * Universal Name & Metadata Extractor:
/**
 * Safely extracts a human-readable name from Invi POS JSON structures.
 * Explicitly rejects IDs (numbers like 0, 1, 2 or numeric strings like "0", "0.0"),
 * null/undefined/empty/boolean values, and placeholder strings like "uncategorized", "none", "n/a".
 */
export function extractNameHelper(rawVal: any): string | undefined {
  if (rawVal === undefined || rawVal === null) return undefined;

  // Numbers (like 0, 1, 23) are database IDs, NEVER human-readable category or brand names!
  if (typeof rawVal === 'number') {
    return undefined;
  }

  // Booleans
  if (typeof rawVal === 'boolean') {
    return undefined;
  }

  // Handle strings
  if (typeof rawVal === 'string') {
    const trimmed = rawVal.trim();
    if (!trimmed) return undefined;

    // JSON stringified arrays or objects
    if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
      try {
        const parsed = JSON.parse(trimmed);
        return extractNameHelper(parsed);
      } catch (e) {
        // Not JSON, continue as string
      }
    }

    // Reject pure numbers (e.g. "0", "0.0", "123")
    if (/^\d+(\.\d+)?$/.test(trimmed)) {
      return undefined;
    }

    const lower = trimmed.toLowerCase();
    const blacklist = [
      '0', '0.0', '0.00', 'null', 'undefined', 'false', 'true', 'none',
      'uncategorized', 'unbranded', 'no category', 'no brand', 'n/a', 'na',
      '—', '-', '[object object]', 'untitled', 'default'
    ];
    if (blacklist.includes(lower)) {
      return undefined;
    }

    return trimmed;
  }

  if (Array.isArray(rawVal) && rawVal.length > 0) {
    for (const item of rawVal) {
      const parsed = extractNameHelper(item);
      if (parsed) return parsed;
    }
    return undefined;
  }

  if (typeof rawVal === 'object') {
    // Only inspect explicit human-readable text properties (ignore id, cat_id, brand_id)
    const candidate =
      rawVal.name ||
      rawVal.cat_name ||
      rawVal.category_name ||
      rawVal.brand_name ||
      rawVal.title ||
      rawVal.label ||
      rawVal.group_name ||
      rawVal.vendor ||
      rawVal.manufacturer;
    return extractNameHelper(candidate);
  }

  return undefined;
}

/**
 * Smart Multi-Route Normalizer: Maps diverse remote JSON structures / column names
 * into canonical Femcart Product and Category schemas.
 */
export function normalizeRemoteProductItem(rp: any, entityType: string = 'PRODUCT', targetBaseUrl: string = '') {
  // Remote ID (sell_id, order_id, client_id, customer_id, pid, cat_id, brand_id, id, etc.)
  const remoteId = String(
    extractField(rp, [
      'sell_id', 'order_id', 'client_id', 'customer_id', 'user_id', 'pid', 'cat_id', 'brand_id',
      'id', 'product_id', 'item_id', 'invi_id', 'invi_pid', 'code', 'order_number', 'order_no', 'invoice_no'
    ]) || ''
  );

  // Customer / Client / User Name or Contact
  const customerName = String(
    extractField(rp, ['customer_name', 'client_name', 'client', 'customer', 'user_name', 'billing_name', 'full_name', 'name', 'pname']) || ''
  ).trim();
  const phone = String(
    extractField(rp, ['phone', 'mobile', 'customer_mobile', 'client_mobile', 'contact_no', 'cell', 'phone_number']) || ''
  ).trim();
  const address = String(
    extractField(rp, ['address', 'delivery_address', 'shipping_address', 'billing_address', 'location', 'city']) || ''
  ).trim();
  const status = String(
    extractField(rp, ['order_status', 'sell_status', 'status', 'payment_status', 'state', 'order_state', 'delivery_status']) || 'Active'
  ).trim();
  const date = String(
    extractField(rp, ['sell_date', 'order_date', 'created_at', 'date', 'date_created', 'updated_at', 'timestamp', 'created_date']) || ''
  ).trim();

  // SKU / Barcode / Reference Code
  let rawSku = String(
    extractField(rp, [
      'pcode', 'sku', 'item_code', 'barcode', 'order_number', 'order_no', 'invoice_no',
      'memo_no', 'sell_code', 'phone', 'mobile', 'client_id', 'article_no'
    ]) || ''
  ).trim();

  // ----------------------------------------------------
  // Category Name (cat_name, category, categories, etc.)
  // ----------------------------------------------------
  const categoryName =
    extractNameHelper(rp.categories) ||
    extractNameHelper(rp.category) ||
    extractNameHelper(rp.categoryName) ||
    extractNameHelper(rp.cat_name) ||
    extractNameHelper(rp.category_name) ||
    extractNameHelper(rp.cat_title) ||
    extractNameHelper(rp.category_title) ||
    extractNameHelper(rp.product_category) ||
    extractNameHelper(rp.p_cat) ||
    extractNameHelper(rp.pcat) ||
    extractNameHelper(rp.group_name) ||
    extractNameHelper(rp.item_group) ||
    extractNameHelper(rp.department) ||
    extractNameHelper(rp.section);

  // ----------------------------------------------------
  // Brand Name (brand_name, brand, brands, vendor, etc.)
  // ----------------------------------------------------
  const brandName =
    extractNameHelper(rp.brands) ||
    extractNameHelper(rp.brand) ||
    extractNameHelper(rp.brandName) ||
    extractNameHelper(rp.brand_name) ||
    extractNameHelper(rp.brand_title) ||
    extractNameHelper(rp.vendor) ||
    extractNameHelper(rp.manufacturer) ||
    extractNameHelper(rp.make) ||
    extractNameHelper(rp.company) ||
    extractNameHelper(rp.supplier) ||
    extractNameHelper(rp.b_name) ||
    extractNameHelper(rp.p_brand) ||
    extractNameHelper(rp.pbrand) ||
    extractNameHelper(rp.item_brand);

  // Smart Name / Title & SKU Extraction strictly based on Entity Type
  let rawName = '';

  if (entityType === 'ORDER') {
    const orderNum = rp.order_number || rp.order_no || rp.invoice_no || rp.memo_no || rp.sell_id || rp.order_id || rp.id || remoteId || 'ORD';
    if (customerName && customerName !== 'Unnamed Record') {
      rawName = `Order #${orderNum} — ${customerName}`;
    } else if (phone) {
      rawName = `Order #${orderNum} — ${phone}`;
    } else {
      rawName = `Order #${orderNum}`;
    }
    if (!rawSku) rawSku = `ORD-${orderNum}`;
  } else if (entityType === 'CUSTOMER') {
    if (customerName && customerName !== 'Unnamed Record') {
      rawName = customerName;
    } else if (phone) {
      rawName = `Customer (${phone})`;
    } else {
      const clientId = rp.client_id || rp.customer_id || remoteId;
      rawName = `Customer #${clientId}`;
    }
    if (!rawSku) rawSku = phone ? phone : `CUST-${remoteId || Math.floor(Math.random() * 10000)}`;
  } else if (entityType === 'CATEGORY') {
    rawName = String(extractField(rp, ['cat_name', 'category_name', 'name', 'title']) || `Category #${remoteId}`).trim();
    if (!rawSku) rawSku = String(rp.slug || rp.cat_id || `CAT-${remoteId}`);
  } else if (entityType === 'BRAND') {
    rawName = String(extractField(rp, ['brand_name', 'name', 'title']) || `Brand #${remoteId}`).trim();
    if (!rawSku) rawSku = String(rp.slug || rp.brand_id || `BRD-${remoteId}`);
  } else {
    // ----------------------------------------------------
    // PRODUCT ENTITY (Default & Primary Feed)
    // ----------------------------------------------------
    // 1. High-priority dedicated product name fields
    let candidateName = extractField(rp, [
      'pname', 'product_name', 'item_name', 'prod_name', 'p_name', 'article_name', 'model'
    ]);

    // 2. Generic name fields (only if not equal to category or uncategorized)
    if (!candidateName) {
      const genericName = extractField(rp, ['name', 'title', 'product_title', 'post_title']);
      if (genericName) {
        const genTrim = String(genericName).trim();
        const isCatName = categoryName && genTrim.toLowerCase() === categoryName.toLowerCase();
        const isUncategorized = genTrim.toLowerCase() === 'uncategorized' || genTrim.toLowerCase() === 'none';
        if (!isCatName && !isUncategorized) {
          candidateName = genTrim;
        }
      }
    }

    rawName = String(candidateName || '').trim();

    // 3. Fallback safely to SKU or ID (NEVER use category/brand name!)
    if (!rawName || rawName.toLowerCase() === 'uncategorized' || rawName.toLowerCase() === 'none' || rawName.toLowerCase() === 'unnamed' || rawName.toLowerCase() === 'unnamed product') {
      if (rawSku) {
        rawName = `Product (${rawSku})`;
      } else if (remoteId) {
        rawName = `Product #${remoteId}`;
      } else {
        rawName = 'Untitled Product';
      }
    }
  }

  // Price / Total / Due / Amount
  const rawPriceVal = extractField(rp, [
    'tot_bill', 'total', 'grand_total', 'final_total', 'net_total', 'amount', 'bill_amount',
    'due', 'total_spent', 'total_order_amount', 'mrp', 'price', 'regular_price', 'unit_price', 'sale_price', 'selling_price'
  ]);
  const remotePrice = typeof rawPriceVal === 'number' ? rawPriceVal : (parseFloat(String(rawPriceVal || '0')) || 0);

  // Compare / Regular Price
  const rawCompareVal = extractField(rp, ['compare_price', 'compare_at_price', 'regular_price', 'msrp', 'original_price']);
  const comparePrice = typeof rawCompareVal === 'number' ? rawCompareVal : (rawCompareVal ? parseFloat(String(rawCompareVal)) : null);

  // Stock / Count / Total Items
  const rawStockVal = extractField(rp, [
    'total_items', 'items_count', 'total_qty', 'qty', 'count', 'orders_count', 'products_count',
    'stock_counter', 'stock_quantity', 'stock', 'quantity', 'inventory_quantity', 'available_qty'
  ]);
  const remoteStock = typeof rawStockVal === 'number' ? Math.floor(rawStockVal) : (parseInt(String(rawStockVal ?? '0'), 10) || 0);

  // ----------------------------------------------------
  // Image URL Resolution (Full Support for all POS variations & Relative Paths)
  // ----------------------------------------------------
  let image: string | undefined;
  if (Array.isArray(rp.images) && rp.images.length > 0) {
    const firstImg = rp.images[0];
    image = typeof firstImg === 'string' ? firstImg : (firstImg?.src || firstImg?.url || firstImg?.link || firstImg?.file_name);
  } else {
    image = extractField(rp, [
      'image', 'image_url', 'img', 'product_image', 'pimage', 'p_image', 'photo', 'photo_url',
      'picture', 'thumbnail', 'thumb', 'featured_image', 'file_name', 'image_path', 'media_url', 'logo'
    ]);
  }

  if (image && typeof image === 'string') {
    image = image.trim();
    if (image.toLowerCase() === 'null' || image.toLowerCase() === 'undefined' || image === '') {
      image = undefined;
    } else if (targetBaseUrl && !image.startsWith('http://') && !image.startsWith('https://') && !image.startsWith('data:')) {
      const cleanBase = targetBaseUrl.replace(/\/$/, '');
      image = `${cleanBase}/${image.replace(/^\//, '')}`;
    }
  }

  // Description
  const description = String(extractField(rp, ['description', 'details', 'body_html', 'content', 'post_content', 'short_description', 'notes', 'remarks']) || '');

  return {
    remoteId,
    sku: rawSku || (remoteId ? `INVI-${remoteId}` : `INVI-${Math.floor(Math.random() * 100000)}`),
    name: rawName,
    price: remotePrice,
    comparePrice,
    stock: remoteStock,
    categoryName,
    brandName,
    image,
    description,
    phone,
    address,
    status,
    date,
    customerName,
    slug: rp.slug || rawName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, ''),
    rawItem: rp,
  };
}

/**
 * 1. Test Handshake with Remote Invi / POS URL
 */
router.post('/test', async (req: Request, res: Response) => {
  const startTime = Date.now();
  try {
    const { targetUrl, apiKey, authType, keyParamName = 'x-consumer-key', productsRoute = '/api/ecom/products/all' } = req.body;

    if (!targetUrl) {
      return res.status(400).json({ success: false, message: 'Target URL is required' });
    }

    const cleanBase = targetUrl.replace(/\/$/, '');
    const rawRoute = (productsRoute || '/api/ecom/products/all').trim();
    const normalizedRoute = rawRoute.startsWith('/') ? rawRoute : `/${rawRoute}`;
    let fullUrlStr = `${cleanBase}${normalizedRoute}`;

    const urlObj = new URL(fullUrlStr);
    if (!urlObj.pathname.includes('/all') && !urlObj.searchParams.has('per_page') && !urlObj.searchParams.has('limit')) {
      urlObj.searchParams.set('per_page', '1');
    }

    if (authType === 'QUERY_PARAM') {
      urlObj.searchParams.set(keyParamName || 'consumer_key', apiKey || '');
    }
    let url = urlObj.toString();

    const headers: Record<string, string> = {
      'User-Agent': 'Femcart-Invi-Bridge/1.0',
      'Accept': 'application/json, text/plain, */*'
    };

    if (authType === 'BEARER_TOKEN') {
      headers['Authorization'] = `Bearer ${apiKey}`;
    } else if (authType !== 'QUERY_PARAM') {
      // Default: HEADER (x-consumer-key)
      headers[keyParamName || 'x-consumer-key'] = apiKey || '';
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 12000);

    const response = await fetch(url, {
      method: 'GET',
      headers,
      signal: controller.signal
    });
    clearTimeout(timeoutId);

    const latencyMs = Date.now() - startTime;

    if (response.ok) {
      return res.json({
        success: true,
        message: 'Successfully reached Invi POS endpoint',
        latencyMs,
        statusCode: response.status
      });
    } else {
      return res.status(response.status).json({
        success: false,
        message: `Remote server returned HTTP ${response.status}: ${response.statusText}`,
        latencyMs
      });
    }
  } catch (error: any) {
    const latencyMs = Date.now() - startTime;
    return res.status(502).json({
      success: false,
      message: error.name === 'AbortError' ? 'Connection timed out after 8s' : (error.message || 'Failed to connect to remote server'),
      latencyMs
    });
  }
});

/**
 * 2. Get Saved Remote Configurations
 */
router.get('/configs', async (_req: Request, res: Response) => {
  try {
    return res.json(savedRemoteConfigs);
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
});

/**
 * 3. Save Remote Configuration
 */
router.post('/configs', async (req: Request, res: Response) => {
  try {
    const configData = {
      id: req.body.id || `cfg_${Date.now()}`,
      ...req.body,
      updatedAt: new Date().toISOString()
    };

    const existingIndex = savedRemoteConfigs.findIndex((c) => c.id === configData.id);
    if (existingIndex >= 0) {
      savedRemoteConfigs[existingIndex] = configData;
    } else {
      savedRemoteConfigs.unshift(configData);
    }

    return res.json({ success: true, data: configData });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
});

/**
 * 4. Fetch Remote Invi Catalog and Calculate Diff / Staging Preview
 */
router.post('/preview', async (req: Request, res: Response) => {
  try {
    const { config, limit = 100, conflictStrategy = 'UPDATE_STOCK_PRICE' } = req.body;

    if (!config?.targetUrl || !config?.apiKey) {
      return res.status(400).json({ success: false, message: 'Remote Invi POS configuration is required' });
    }

    const cleanBase = config.targetUrl.replace(/\/$/, '');
    const rawRoute = (config.productsRoute || '/api/ecom/products/all').trim();
    const normalizedRoute = rawRoute.startsWith('/') ? rawRoute : `/${rawRoute}`;
    const productsRoute = normalizedRoute;
    let fullUrlStr = `${cleanBase}${normalizedRoute}`;

    const urlObj = new URL(fullUrlStr);
    if (!urlObj.pathname.includes('/all') && !urlObj.searchParams.has('per_page') && !urlObj.searchParams.has('limit')) {
      urlObj.searchParams.set('per_page', String(Math.min(limit, 100)));
    }

    if (config.authType === 'QUERY_PARAM') {
      urlObj.searchParams.set(config.keyParamName || 'consumer_key', config.apiKey);
    }
    let url = urlObj.toString();

    const headers: Record<string, string> = {
      'User-Agent': 'Femcart-Invi-Bridge/1.0',
      'Accept': 'application/json, text/plain, */*'
    };

    if (config.authType === 'BEARER_TOKEN') {
      headers['Authorization'] = `Bearer ${config.apiKey}`;
    } else if (config.authType !== 'QUERY_PARAM') {
      // Default: HEADER (x-consumer-key)
      headers[config.keyParamName || 'x-consumer-key'] = config.apiKey;
    }

    const controller = new AbortController();
    // 35s timeout for large catalog downloads (5,000+ items)
    const timeoutId = setTimeout(() => controller.abort(), 35000);

    const remoteRes = await fetch(url, { headers, signal: controller.signal });
    clearTimeout(timeoutId);

    if (!remoteRes.ok) {
      return res.status(remoteRes.status).json({
        success: false,
        message: `Remote POS returned HTTP ${remoteRes.status}: ${remoteRes.statusText}`
      });
    }

    const rawJson: any = await remoteRes.json().catch(() => null);
    let productsArray: any[] = [];

    if (Array.isArray(rawJson)) {
      productsArray = rawJson;
    } else if (rawJson && typeof rawJson === 'object') {
      if (Array.isArray(rawJson.data)) {
        productsArray = rawJson.data;
      } else if (Array.isArray(rawJson.items)) {
        productsArray = rawJson.items;
      } else if (Array.isArray(rawJson.products)) {
        productsArray = rawJson.products;
      } else if (Array.isArray(rawJson.results)) {
        productsArray = rawJson.results;
      } else if (Array.isArray(rawJson.records)) {
        productsArray = rawJson.records;
      } else if (Array.isArray(rawJson.categories)) {
        productsArray = rawJson.categories;
      } else if (rawJson.data && typeof rawJson.data === 'object' && Array.isArray(rawJson.data.items)) {
        productsArray = rawJson.data.items;
      } else if (rawJson.data && typeof rawJson.data === 'object' && Array.isArray(rawJson.data.products)) {
        productsArray = rawJson.data.products;
      } else if (rawJson.id || rawJson.sku || rawJson.name || rawJson.title || rawJson.item_code) {
        productsArray = [rawJson];
      }
    }

    if (productsArray.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'No array or records found at this endpoint. Please verify the endpoint route returns a JSON array or object containing items.'
      });
    }

    // Fetch existing products and variants from DB for multi-level matching (including soft-deleted records to prevent unique collisions)
    const [existingProducts, existingVariants] = await Promise.all([
      prisma.product.findMany({
        select: {
          id: true,
          name: true,
          sku: true,
          price: true,
          stock: true,
          inviId: true,
          externalId: true,
          slug: true,
          deletedAt: true,
          brandId: true,
          brand: { select: { id: true, name: true } },
          categories: { select: { id: true, name: true } }
        }
      }),
      prisma.productVariant.findMany({
        select: {
          id: true,
          productId: true,
          sku: true,
          price: true,
          stock: true,
          inviId: true,
          product: {
            select: {
              id: true,
              name: true,
              slug: true,
              deletedAt: true,
              brandId: true,
              brand: { select: { id: true, name: true } },
              categories: { select: { id: true, name: true } }
            }
          }
        }
      })
    ]);

    interface MatchedDbItem {
      type: 'PRODUCT' | 'VARIANT';
      id: string;
      productId?: string;
      name: string;
      price: number;
      stock: number;
      inviId: string | null;
      categoryName?: string;
      brandName?: string;
      hasCategories: boolean;
      hasBrand: boolean;
      isSoftDeleted: boolean;
    }

    const matchBySku = new Map<string, MatchedDbItem>();
    const matchByInviId = new Map<string, MatchedDbItem>();

    for (const p of existingProducts) {
      const item: MatchedDbItem = {
        type: 'PRODUCT',
        id: p.id,
        name: p.name,
        price: p.price,
        stock: p.stock,
        inviId: p.inviId,
        categoryName: p.categories?.[0]?.name,
        brandName: p.brand?.name,
        hasCategories: (p.categories && p.categories.length > 0),
        hasBrand: !!p.brandId,
        isSoftDeleted: !!p.deletedAt
      };
      if (p.sku) matchBySku.set(p.sku.trim().toLowerCase(), item);
      if (p.inviId) matchByInviId.set(String(p.inviId).trim(), item);
    }

    for (const v of existingVariants) {
      const item: MatchedDbItem = {
        type: 'VARIANT',
        id: v.id,
        productId: v.productId,
        name: `${v.product.name} (Variant)`,
        price: v.price,
        stock: v.stock,
        inviId: v.inviId,
        categoryName: v.product?.categories?.[0]?.name,
        brandName: v.product?.brand?.name,
        hasCategories: (v.product?.categories && v.product.categories.length > 0),
        hasBrand: !!v.product?.brandId,
        isSoftDeleted: !!v.product?.deletedAt
      };
      if (v.sku) matchBySku.set(v.sku.trim().toLowerCase(), item);
      if (v.inviId) matchByInviId.set(String(v.inviId).trim(), item);
    }

    const isCategoryEndpoint = productsRoute.toLowerCase().includes('categor');
    const isBrandEndpoint = productsRoute.toLowerCase().includes('brand');
    const isStockEndpoint = productsRoute.toLowerCase().includes('stock') && !productsRoute.toLowerCase().includes('product');
    const isOrderEndpoint = productsRoute.toLowerCase().includes('order') || productsRoute.toLowerCase().includes('sell');
    const isCustomerEndpoint = productsRoute.toLowerCase().includes('customer') || productsRoute.toLowerCase().includes('client') || productsRoute.toLowerCase().includes('user');

    const detectedEntityType: 'PRODUCT' | 'CATEGORY' | 'BRAND' | 'STOCK' | 'ORDER' | 'CUSTOMER' =
      isCategoryEndpoint ? 'CATEGORY'
      : isBrandEndpoint ? 'BRAND'
      : isStockEndpoint ? 'STOCK'
      : isOrderEndpoint ? 'ORDER'
      : isCustomerEndpoint ? 'CUSTOMER'
      : 'PRODUCT';

    let newCount = 0;
    let updateCount = 0;
    let identicalCount = 0;
    let warningCount = 0;

    const isNonProduct = detectedEntityType !== 'PRODUCT' && detectedEntityType !== 'STOCK';

    const auditedItems = productsArray.map((rawItem: any) => {
      const rp = normalizeRemoteProductItem(rawItem, detectedEntityType, cleanBase);

      const warnings: string[] = [];
      if (!isNonProduct) {
        if (!rp.sku) warnings.push('Missing SKU (will use INVI ID SKU)');
        if (rp.price <= 0) warnings.push('Zero price (৳0)');
      }

      // Strict Product Uniqueness: 1) SKU, 2) Invi ID / Remote ID (Never match by name!)
      const effectiveSku = (rp.sku || (rp.remoteId ? `INVI-${rp.remoteId}` : '')).trim();
      const matched = (effectiveSku && matchBySku.get(effectiveSku.toLowerCase())) ||
        (rp.remoteId && matchByInviId.get(String(rp.remoteId).trim()));

      let diffType: 'NEW_PRODUCT' | 'STOCK_PRICE_UPDATE' | 'IDENTICAL' | 'WARNING' = 'NEW_PRODUCT';
      let action: 'CREATE' | 'UPDATE' | 'SKIP' = 'CREATE';

      if (!matched) {
        diffType = 'NEW_PRODUCT';
        action = 'CREATE';
        newCount++;
      } else {
        const priceDiff = Math.abs(matched.price - rp.price) > 0.01;
        const stockDiff = matched.stock !== rp.stock;
        const metaMissingInDb = (!matched.hasCategories && !!rp.categoryName) || (!matched.hasBrand && !!rp.brandName);
        const metaDiff = (!!rp.categoryName && rp.categoryName !== matched.categoryName) || (!!rp.brandName && rp.brandName !== matched.brandName);
        const isOverwrite = conflictStrategy === 'OVERWRITE_ALL';
        const isSoftDeleted = matched.isSoftDeleted;

        if (isSoftDeleted || priceDiff || stockDiff || metaMissingInDb || metaDiff || isOverwrite) {
          diffType = 'STOCK_PRICE_UPDATE';
          action = conflictStrategy === 'SKIP_EXISTING' && !isSoftDeleted ? 'SKIP' : 'UPDATE';
          updateCount++;
        } else {
          diffType = 'IDENTICAL';
          action = 'SKIP';
          identicalCount++;
        }
      }

      return {
        remoteId: rp.remoteId,
        name: rp.name,
        sku: effectiveSku || `INVI-${rp.remoteId || Math.floor(Math.random() * 100000)}`,
        slug: rp.slug,
        remotePrice: rp.price,
        comparePrice: rp.comparePrice,
        remoteStock: rp.stock,
        currentDbPrice: matched ? matched.price : undefined,
        currentDbStock: matched ? matched.stock : undefined,
        currentDbId: matched ? matched.id : undefined,
        matchedType: matched ? matched.type : undefined,
        categoryName: rp.categoryName,
        brandName: rp.brandName,
        image: rp.image,
        description: rp.description,
        phone: rp.phone,
        address: rp.address,
        status: rp.status,
        date: rp.date,
        diffType,
        existsInDb: !!matched,
        warnings,
        selected: action !== 'SKIP',
        action,
        adjustedPrice: rp.price,
        adjustedStock: rp.stock,
        rawItem: rp.rawItem || rawItem,
      };
    });

    return res.json({
      success: true,
      items: auditedItems,
      detectedEntityType,
      summary: {
        total: auditedItems.length,
        newCount,
        updateCount,
        identicalCount,
        warningCount,
        detectedEntityType,
      }
    });
  } catch (error: any) {
    return res.status(500).json({
      success: false,
      message: error.message || 'Failed to fetch catalog from remote POS'
    });
  }
});

/**
 * 5. Commit Audited Items to Project DB
 */
router.post('/commit', async (req: Request, res: Response) => {
  try {
    const { items, autoCreateMeta = true, isDryRun = false } = req.body;

    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ success: false, message: 'No items provided for migration' });
    }

    let createdCount = 0;
    let updatedCount = 0;
    let skippedCount = 0;
    let identicalSkippedCount = 0;
    let warningSkippedCount = 0;
    let userSkippedCount = 0;

    const errors: Array<{ sku: string; error: string; reason?: string }> = [];
    const simulationDetails: Array<{
      sku: string;
      name: string;
      action: string;
      reason: string;
      diffType?: string;
      matchedType?: string;
      currentDbId?: string;
      oldStock?: number;
      newStock?: number;
      stockDelta?: number;
      oldPrice?: number;
      newPrice?: number;
      category?: string;
      brand?: string;
      willLinkInviId?: string;
    }> = [];

    const categoriesToCreate = new Set<string>();
    const brandsToCreate = new Set<string>();

    for (const item of items) {
      try {
        if (item.action === 'SKIP') {
          skippedCount++;
          
          let skipReason = 'Skipped by user selection or conflict strategy';
          if (item.diffType === 'IDENTICAL') {
            identicalSkippedCount++;
            skipReason = 'Identical to DB: Price & Stock already match existing record (0 writes needed)';
          } else if (item.diffType === 'WARNING') {
            warningSkippedCount++;
            skipReason = `Validation warning: ${item.warnings?.join(', ') || 'Item excluded'}`;
          } else {
            userSkippedCount++;
          }

          if (isDryRun) {
            simulationDetails.push({
              sku: item.sku,
              name: item.name,
              action: 'WOULD_SKIP',
              reason: skipReason,
              diffType: item.diffType || (item.existsInDb ? 'IDENTICAL' : 'USER_SKIP'),
              oldStock: item.currentDbStock,
              newStock: item.remoteStock,
              oldPrice: item.currentDbPrice,
              newPrice: item.remotePrice,
            });
          }
          continue;
        }

        const price = Number(item.price ?? item.remotePrice ?? 0);
        const stock = Number(item.stock ?? item.remoteStock ?? 0);
        const sku = String(item.sku).trim();

        if (isDryRun) {
          if (item.action === 'CREATE' || !item.existsInDb) {
            createdCount++;
            if (item.categoryName) categoriesToCreate.add(item.categoryName);
            if (item.brandName) brandsToCreate.add(item.brandName);
            simulationDetails.push({
              sku,
              name: item.name,
              action: 'WOULD_CREATE_PRODUCT',
              reason: 'New Product: Not found in database. Will create new product and link category/brand.',
              diffType: 'NEW_PRODUCT',
              newStock: stock,
              newPrice: price,
              category: item.categoryName,
              brand: item.brandName,
              willLinkInviId: item.remoteId ? String(item.remoteId) : undefined
            });
          } else if (item.action === 'UPDATE' && item.currentDbId) {
            updatedCount++;
            const priceChange = item.currentDbPrice !== price;
            const stockChange = item.currentDbStock !== stock;
            const deltaDesc = [
              priceChange ? `Price: ৳${item.currentDbPrice ?? 0} → ৳${price}` : '',
              stockChange ? `Stock: ${item.currentDbStock ?? 0} → ${stock}` : '',
            ].filter(Boolean).join(', ');

            simulationDetails.push({
              sku,
              name: item.name,
              action: item.matchedType === 'VARIANT' ? 'WOULD_UPDATE_VARIANT' : 'WOULD_UPDATE_PRODUCT',
              reason: `Updated values detected (${deltaDesc || 'Price/Stock'}). Will update product & record inventory ledger.`,
              diffType: 'STOCK_PRICE_UPDATE',
              matchedType: item.matchedType,
              currentDbId: item.currentDbId,
              oldStock: item.currentDbStock,
              newStock: stock,
              stockDelta: stock - (item.currentDbStock || 0),
              oldPrice: item.currentDbPrice,
              newPrice: price,
              willLinkInviId: item.remoteId ? String(item.remoteId) : undefined
            });
          }
          continue;
        }

        // Check entity type
        const entityType = item.detectedEntityType || 'PRODUCT';

        if (entityType === 'CATEGORY') {
          const catSlug = (item.slug || item.name).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
          await prisma.category.upsert({
            where: { slug: catSlug },
            update: {
              name: item.name,
              image: item.image || undefined,
            },
            create: {
              name: item.name,
              slug: catSlug,
              image: item.image || null,
            }
          });
          createdCount++;
          continue;
        }

        if (entityType === 'BRAND') {
          const brandSlug = (item.slug || item.name).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
          await prisma.brand.upsert({
            where: { slug: brandSlug },
            update: {
              name: item.name,
              logo: item.image || undefined,
            },
            create: {
              name: item.name,
              slug: brandSlug,
              logo: item.image || null,
            }
          });
          createdCount++;
          continue;
        }

        // Live Database Commit Mode using atomic importInviProductItem
        const result = await importInviProductItem(item);
        if (result === 'created') createdCount++;
        else if (result === 'updated') updatedCount++;
        else skippedCount++;
      } catch (err: any) {
        errors.push({ sku: item.sku, error: err.message });
      }
    }

    if (isDryRun) {
      return res.json({
        success: true,
        isDryRun: true,
        message: `Dry Run Simulation Complete: ${createdCount} would be created, ${updatedCount} would be updated, ${skippedCount} would be skipped (0 changes made to database).`,
        summary: {
          total: items.length,
          wouldCreate: createdCount,
          wouldUpdate: updatedCount,
          wouldSkip: skippedCount,
          skippedBreakdown: {
            identical: identicalSkippedCount,
            warnings: warningSkippedCount,
            userExcluded: userSkippedCount,
          },
          categoriesToCreate: Array.from(categoriesToCreate),
          brandsToCreate: Array.from(brandsToCreate),
          failed: errors.length,
          errors
        },
        simulationDetails: simulationDetails.slice(0, 500)
      });
    }

    // Invalidate Redis & in-memory cache versions so stock updates and new products reflect in real-time immediately
    try {
      await CacheService.invalidateAllCatalog();
    } catch (cacheErr: any) {
      console.warn('[Invi POS Sync] Cache invalidation warning:', cacheErr.message);
    }

    return res.json({
      success: errors.length === 0,
      isDryRun: false,
      message: `Migration completed: ${createdCount} created, ${updatedCount} updated, ${skippedCount} skipped.`,
      summary: {
        total: items.length,
        created: createdCount,
        updated: updatedCount,
        skipped: skippedCount,
        skippedBreakdown: {
          identical: identicalSkippedCount,
          warnings: warningSkippedCount,
          userExcluded: userSkippedCount,
        },
        failed: errors.length,
        errors
      }
    });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
});

// ─── 6. Dedicated Invi POS Batch Tasks Endpoints ──────────────────────────────

/**
 * List all Invi POS import tasks
 */
router.get('/tasks', async (_req: Request, res: Response) => {
  try {
    const tasks = await prisma.importTask.findMany({
      where: { entityType: 'INVI_PRODUCTS' },
      orderBy: { pageNumber: 'asc' }
    });
    const formatted = tasks.map((t) => {
      let logs: string[] = [];
      try {
        if (t.details) {
          const parsed = JSON.parse(t.details);
          if (parsed && typeof parsed === 'object') {
            if (Array.isArray(parsed.logs)) {
              logs = parsed.logs;
            } else if (Array.isArray(parsed)) {
              if (typeof parsed[0] === 'string') logs = parsed;
              else logs = [`📦 Staged ${parsed.length} items for execution.`];
            }
          }
        }
      } catch {
        logs = t.details ? [t.details] : [];
      }
      return {
        ...t,
        details: logs
      };
    });
    return res.json({ success: true, data: formatted });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
});

/**
 * Generate Invi POS batch tasks from remote endpoint
 */
router.post('/tasks/generate', async (req: Request, res: Response) => {
  try {
    const { config, perPage = 20 } = req.body;
    if (!config?.targetUrl || !config?.apiKey) {
      return res.status(400).json({ success: false, message: 'Remote Invi POS configuration is required' });
    }

    const result = await generateInviTasks(config, perPage, true);
    return res.json({ success: true, message: `Successfully generated ${result.totalBatches} batch tasks for ${result.totalItems} items.`, data: result });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
});

/**
 * Start a single Invi POS batch task
 */
router.post('/tasks/:id/start', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    await startInviTask(id);
    return res.json({ success: true, message: 'Task queued for execution.' });
  } catch (error: any) {
    return res.status(400).json({ success: false, message: error.message });
  }
});

/**
 * Pause a running Invi POS batch task
 */
router.post('/tasks/:id/pause', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    await pauseInviTask(id);
    return res.json({ success: true, message: 'Task pause requested.' });
  } catch (error: any) {
    return res.status(400).json({ success: false, message: error.message });
  }
});

/**
 * Start/queue all pending Invi POS batch tasks
 */
router.post('/tasks/start-all', async (_req: Request, res: Response) => {
  try {
    const result = await startAllInviTasks();
    return res.json({ success: true, message: `Queued ${result.queuedCount} tasks for execution.`, data: result });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
});

/**
 * Clear all Invi POS batch tasks
 */
router.delete('/tasks', async (_req: Request, res: Response) => {
  try {
    await clearInviTasks();
    return res.json({ success: true, message: 'All Invi POS batch tasks cleared.' });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
});

export default router;
