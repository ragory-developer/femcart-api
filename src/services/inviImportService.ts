/**
 * Invi POS Dedicated Import Service
 * Handles atomic item imports, safe Unicode slugification, category/brand caching,
 * and batch task generation for Invi POS integration.
 */

import crypto from 'crypto';
import prisma from '../config/database';
import { CacheService } from '../core/redis/CacheService';
import { KeyFactory } from '../core/redis/KeyFactory';
import { normalizeRemoteProductItem, extractNameHelper } from '../routes/posRemoteImportRoutes';

// ─── In-Memory Taxonomy Caches ──────────────────────────────────────────────
export const inviCatCache = new Map<string, string>(); // Lowercase Name -> Category ID
export const inviBrandCache = new Map<string, string>(); // Lowercase Name -> Brand ID

export function clearInviCaches() {
  inviCatCache.clear();
  inviBrandCache.clear();
}

/**
 * Multi-language safe slug generator.
 * Converts Roman text to standard slugs. If text contains Unicode/Bangla or strips to empty,
 * generates a deterministic phonetic hash slug to guarantee uniqueness without colliding on "category" or "brand".
 */
export function safeSlugify(text: string, fallbackPrefix: string = 'item'): string {
  if (!text || typeof text !== 'string') {
    return `${fallbackPrefix}-${Date.now().toString().slice(-4)}-${Math.floor(Math.random() * 1000)}`;
  }

  const trimmed = text.trim();
  const latinSlug = trimmed
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

  if (latinSlug && latinSlug.length >= 2 && !['category', 'brand', 'product', 'item', 'null', 'undefined'].includes(latinSlug)) {
    return latinSlug;
  }

  // Non-Latin / Bangla / Reserved / Special Character Text: Create a stable deterministic hash slug
  const hash = crypto.createHash('md5').update(trimmed).digest('hex').slice(0, 6);
  const isReserved = ['category', 'brand', 'product', 'item', 'null', 'undefined', 'uncategorized'].includes(latinSlug);
  const prefix = latinSlug && latinSlug.length > 0 && !isReserved ? latinSlug : fallbackPrefix;
  return `${prefix}-${hash}`;
}

/**
 * Resolves or creates a category safely with in-memory caching and collision prevention.
 */
export async function resolveOrCreateCategory(categoryName?: string, image?: string): Promise<string | undefined> {
  const validName = extractNameHelper(categoryName);
  if (!validName) return undefined;

  const cacheKey = validName.trim().toLowerCase();
  if (inviCatCache.has(cacheKey)) {
    return inviCatCache.get(cacheKey)!;
  }

  const baseSlug = safeSlugify(validName, 'cat');

  // Check DB for existing category by slug or name (case-insensitive)
  let cat = await prisma.category.findFirst({
    where: {
      deletedAt: null,
      OR: [
        { slug: baseSlug },
        { name: { equals: validName, mode: 'insensitive' } }
      ]
    }
  });

  if (!cat) {
    // Generate unique slug if baseSlug is already taken by another deleted or existing record
    let uniqueSlug = baseSlug;
    const existingSlug = await prisma.category.findUnique({ where: { slug: uniqueSlug } });
    if (existingSlug) {
      uniqueSlug = `${baseSlug}-${Date.now().toString().slice(-4)}-${Math.floor(Math.random() * 100)}`;
    }

    try {
      cat = await prisma.category.create({
        data: {
          name: validName,
          slug: uniqueSlug,
          image: image || null
        }
      });
    } catch {
      // Fallback: fetch again in case of concurrent insert
      cat = await prisma.category.findFirst({
        where: {
          OR: [
            { slug: uniqueSlug },
            { name: { equals: validName, mode: 'insensitive' } }
          ]
        }
      });
    }
  }

  if (cat) {
    inviCatCache.set(cacheKey, cat.id);
    return cat.id;
  }

  return undefined;
}

/**
 * Resolves or creates a brand safely with in-memory caching and collision prevention.
 */
export async function resolveOrCreateBrand(brandName?: string, logo?: string): Promise<string | undefined> {
  const validName = extractNameHelper(brandName);
  if (!validName) return undefined;

  const cacheKey = validName.trim().toLowerCase();
  if (inviBrandCache.has(cacheKey)) {
    return inviBrandCache.get(cacheKey)!;
  }

  const baseSlug = safeSlugify(validName, 'brand');

  let brand = await prisma.brand.findFirst({
    where: {
      deletedAt: null,
      OR: [
        { slug: baseSlug },
        { name: { equals: validName, mode: 'insensitive' } }
      ]
    }
  });

  if (!brand) {
    let uniqueSlug = baseSlug;
    const existingSlug = await prisma.brand.findUnique({ where: { slug: uniqueSlug } });
    if (existingSlug) {
      uniqueSlug = `${baseSlug}-${Date.now().toString().slice(-4)}-${Math.floor(Math.random() * 100)}`;
    }

    try {
      brand = await prisma.brand.create({
        data: {
          name: validName,
          slug: uniqueSlug,
          logo: logo || null
        }
      });
    } catch {
      brand = await prisma.brand.findFirst({
        where: {
          OR: [
            { slug: uniqueSlug },
            { name: { equals: validName, mode: 'insensitive' } }
          ]
        }
      });
    }
  }

  if (brand) {
    inviBrandCache.set(cacheKey, brand.id);
    return brand.id;
  }

  return undefined;
}

/**
 * Synchronizes child variants and attributes for variable Invi POS products.
 */
export async function syncInviProductVariants(
  productId: string,
  rawVariants: any[],
  parentPrice: number,
  logFn?: (msg: string) => void
): Promise<void> {
  if (!Array.isArray(rawVariants) || rawVariants.length === 0) return;

  // Mark parent product as VARIABLE
  await prisma.product.update({
    where: { id: productId },
    data: { productType: 'VARIABLE' }
  });

  for (let i = 0; i < rawVariants.length; i++) {
    const v = rawVariants[i];
    if (!v) continue;

    const vSku = String(v.sku || v.pcode || v.code || `VAR-${productId.slice(-4)}-${i + 1}`).trim();
    const vRemoteId = v.id || v.variant_id || v.vid || v.pid ? String(v.id || v.variant_id || v.vid || v.pid) : undefined;
    const vPrice = typeof v.price === 'number' && v.price > 0 ? v.price : parentPrice;
    const vSpecialPrice = typeof v.special_price === 'number' ? v.special_price : (typeof v.compare_price === 'number' ? v.compare_price : null);
    const vStock = typeof v.stock === 'number' ? v.stock : (typeof v.quantity === 'number' ? v.quantity : (typeof v.qty === 'number' ? v.qty : 0));
    const vImage = v.image || v.image_url || null;
    const vIsDefault = i === 0;

    // Attribute extraction
    const attrList: { name: string; value: string }[] = [];
    if (Array.isArray(v.attributes)) {
      for (const a of v.attributes) {
        if (a && typeof a === 'object' && a.name && a.value) {
          attrList.push({ name: String(a.name), value: String(a.value) });
        }
      }
    } else if (v.attributes && typeof v.attributes === 'object') {
      for (const [k, val] of Object.entries(v.attributes)) {
        if (val !== undefined && val !== null && val !== '') {
          attrList.push({ name: k, value: String(val) });
        }
      }
    } else if (v.name && String(v.name).includes('/')) {
      const parts = String(v.name).split('/').map((s: string) => s.trim());
      parts.forEach((p: string, idx: number) => {
        attrList.push({ name: `Option ${idx + 1}`, value: p });
      });
    }

    let existingVariant = await prisma.productVariant.findFirst({
      where: {
        OR: [
          ...(vRemoteId ? [{ inviId: vRemoteId }, { externalId: `invi_var_${vRemoteId}` }] : []),
          { sku: vSku }
        ]
      }
    });

    if (existingVariant) {
      const oldVStock = existingVariant.stock;
      await prisma.productVariant.update({
        where: { id: existingVariant.id },
        data: {
          productId,
          price: vPrice,
          specialPrice: vSpecialPrice,
          stock: vStock,
          image: vImage || existingVariant.image,
          inviId: vRemoteId || existingVariant.inviId,
          externalId: vRemoteId ? `invi_var_${vRemoteId}` : existingVariant.externalId,
          isDefault: existingVariant.isDefault || vIsDefault,
          updatedAt: new Date()
        }
      });

      if (oldVStock !== vStock) {
        await prisma.inventoryLog.create({
          data: {
            productId,
            variantId: existingVariant.id,
            sku: vSku,
            previousStock: oldVStock,
            newStock: vStock,
            delta: vStock - oldVStock,
            source: 'POS_ABSOLUTE',
            reason: 'Invi POS Variant Stock Sync',
            referenceId: vRemoteId || 'INVI-VAR-SYNC'
          }
        });
      }
    } else {
      const newVar = await prisma.productVariant.create({
        data: {
          productId,
          sku: vSku,
          price: vPrice,
          specialPrice: vSpecialPrice,
          stock: vStock,
          image: vImage,
          inviId: vRemoteId,
          externalId: vRemoteId ? `invi_var_${vRemoteId}` : undefined,
          isDefault: vIsDefault,
          attributes: attrList.length > 0 ? {
            create: attrList.map(a => ({ name: a.name, value: a.value }))
          } : undefined
        }
      });

      await prisma.inventoryLog.create({
        data: {
          productId,
          variantId: newVar.id,
          sku: vSku,
          previousStock: 0,
          newStock: vStock,
          delta: vStock,
          source: 'POS_ABSOLUTE',
          reason: 'Invi POS Initial Variant Import',
          referenceId: vRemoteId || 'INVI-VAR-INIT'
        }
      });
    }
  }

  logFn && logFn(`📦 Synchronized ${rawVariants.length} variation(s) for Product`);
}

/**
 * Imports a single Invi POS item with complete transaction safety,
 * variant handling, category/brand attachment, and stock ledger logging.
 */
export async function importInviProductItem(
  item: any,
  logFn?: (msg: string) => void
): Promise<'created' | 'updated' | 'skipped'> {
  const sku = item.sku ? String(item.sku).trim() : '';
  const remoteIdStr = item.remoteId ? String(item.remoteId).trim() : '';
  const rawVariants = item.rawItem?.variants || item.variants || item.rawItem?.variations || [];
  
  // Price resolution: fallback to cost_price if price is 0 and cost_price is available
  let price = Number(item.price ?? item.adjustedPrice ?? item.remotePrice ?? 0);
  if (price === 0 && item.rawItem?.cost_price && Number(item.rawItem.cost_price) > 0) {
    price = Number(item.rawItem.cost_price);
  }
  const comparePrice = item.comparePrice ? Number(item.comparePrice) : null;
  const stock = Number(item.stock ?? item.adjustedStock ?? item.remoteStock ?? 0);

  // 1. Resolve Category & Brand
  const categoryId = await resolveOrCreateCategory(item.categoryName, item.image);
  const brandId = await resolveOrCreateBrand(item.brandName, item.image);

  let finalName = String(item.name || '').trim();
  if (!finalName || ['uncategorized', 'none', 'null', 'unnamed', 'unnamed product', 'untitled'].includes(finalName.toLowerCase())) {
    finalName = sku ? `Product (${sku})` : (remoteIdStr ? `Product #${remoteIdStr}` : 'Untitled Product');
  }

  // 2. Check if this item is a Product Variant
  if (item.matchedType === 'VARIANT' && item.currentDbId) {
    const existingVariant = await prisma.productVariant.findUnique({
      where: { id: item.currentDbId },
      include: { product: true }
    });

    if (existingVariant) {
      const oldStock = existingVariant.stock;
      await prisma.productVariant.update({
        where: { id: existingVariant.id },
        data: {
          price,
          specialPrice: comparePrice || existingVariant.specialPrice,
          stock,
          inviId: remoteIdStr || existingVariant.inviId,
          image: item.image || existingVariant.image,
          updatedAt: new Date()
        }
      });

      if (oldStock !== stock) {
        await prisma.inventoryLog.create({
          data: {
            productId: existingVariant.productId,
            variantId: existingVariant.id,
            sku: sku || existingVariant.sku || '',
            previousStock: oldStock,
            newStock: stock,
            delta: stock - oldStock,
            source: 'POS_ABSOLUTE',
            reason: 'Invi POS Variant Stock Sync',
            referenceId: remoteIdStr || 'INVI-VAR-SYNC'
          }
        });
      }

      logFn && logFn(`✔️ Updated Variant "${existingVariant.sku || finalName}" (Stock: ${oldStock} ➔ ${stock}, Price: ৳${price})`);
      return 'updated';
    }
  }

  // 3. Search for Existing Product by: currentDbId -> inviId -> externalId -> SKU
  let existingProduct: any = null;

  if (item.currentDbId && typeof item.currentDbId === 'string' && item.currentDbId.trim() && item.matchedType !== 'VARIANT') {
    existingProduct = await prisma.product.findUnique({
      where: { id: item.currentDbId.trim() }
    });
  }

  if (!existingProduct && remoteIdStr) {
    existingProduct = await prisma.product.findFirst({
      where: {
        OR: [
          { inviId: remoteIdStr },
          { externalId: `invi_${remoteIdStr}` },
          { externalId: remoteIdStr }
        ]
      }
    });
  }

  if (!existingProduct && sku) {
    existingProduct = await prisma.product.findFirst({
      where: { sku }
    });
  }

  // 4. Update Existing Product
  if (existingProduct) {
    const oldStock = existingProduct.stock;

    await prisma.product.update({
      where: { id: existingProduct.id },
      data: {
        name: finalName || existingProduct.name,
        price,
        comparePrice: comparePrice || existingProduct.comparePrice,
        stock,
        inviId: remoteIdStr || existingProduct.inviId,
        externalId: remoteIdStr ? `invi_${remoteIdStr}` : existingProduct.externalId,
        description: item.description || existingProduct.description,
        image: item.image || existingProduct.image,
        images: item.image ? JSON.stringify([item.image]) : existingProduct.images,
        brandId: brandId || existingProduct.brandId,
        categories: categoryId ? { set: [{ id: categoryId }] } : undefined,
        deletedAt: null,
        deletedBy: null,
        updatedAt: new Date()
      }
    });

    if (oldStock !== stock) {
      await prisma.inventoryLog.create({
        data: {
          productId: existingProduct.id,
          sku: sku || existingProduct.sku || '',
          previousStock: oldStock,
          newStock: stock,
          delta: stock - oldStock,
          source: 'POS_ABSOLUTE',
          reason: 'Invi Remote Sync Overwrite',
          referenceId: remoteIdStr || 'INVI-SYNC'
        }
      });
    }

    if (rawVariants.length > 0) {
      await syncInviProductVariants(existingProduct.id, rawVariants, price, logFn);
    }

    logFn && logFn(`✔️ Updated Product "${finalName}" (SKU: ${sku || 'N/A'}, Stock: ${oldStock} ➔ ${stock}, Price: ৳${price})`);
    return 'updated';
  }

  // 5. Create New Product
  const baseSlug = safeSlugify(finalName, 'prod');
  let uniqueSlug = baseSlug;
  let attempts = 0;
  while (attempts < 5 && (await prisma.product.findFirst({ where: { slug: uniqueSlug } }))) {
    uniqueSlug = `${baseSlug}-${Date.now().toString().slice(-4)}-${Math.floor(Math.random() * 10000)}`;
    attempts++;
  }

  let fallbackImage = item.image;
  if (!fallbackImage && categoryId) {
    const cat = await prisma.category.findUnique({ where: { id: categoryId }, select: { image: true } });
    if (cat?.image) fallbackImage = cat.image;
  }

  try {
    const newProduct = await prisma.product.create({
      data: {
        name: finalName,
        slug: uniqueSlug,
        sku: sku || undefined,
        price,
        comparePrice: comparePrice || null,
        stock,
        inviId: remoteIdStr || undefined,
        externalId: remoteIdStr ? `invi_${remoteIdStr}` : undefined,
        description: item.description || '',
        images: fallbackImage ? JSON.stringify([fallbackImage]) : '[]',
        image: fallbackImage || null,
        brandId: brandId || undefined,
        categories: categoryId ? { connect: [{ id: categoryId }] } : undefined,
        deletedAt: null,
        deletedBy: null
      }
    });

    await prisma.inventoryLog.create({
      data: {
        productId: newProduct.id,
        sku: sku || '',
        previousStock: 0,
        newStock: stock,
        delta: stock,
        source: 'POS_ABSOLUTE',
        reason: 'Invi POS Initial Import',
        referenceId: remoteIdStr || 'INVI-INIT'
      }
    });

    if (rawVariants.length > 0) {
      await syncInviProductVariants(newProduct.id, rawVariants, price, logFn);
    }

    logFn && logFn(`✨ Created Product "${finalName}" (SKU: ${sku || 'N/A'}, Stock: ${stock}, Price: ৳${price})`);
    return 'created';
  } catch (createErr: any) {
    // 5a. If slug collision occurred concurrently, retry with fresh timestamp slug
    if (createErr.code === 'P2002' && (createErr.meta?.target?.includes?.('slug') || String(createErr.message).includes('slug'))) {
      const retrySlug = `${baseSlug}-${Date.now().toString().slice(-6)}-${Math.floor(Math.random() * 100000)}`;
      const newProduct = await prisma.product.create({
        data: {
          name: finalName,
          slug: retrySlug,
          sku: sku || undefined,
          price,
          comparePrice: comparePrice || null,
          stock,
          inviId: remoteIdStr || undefined,
          externalId: remoteIdStr ? `invi_${remoteIdStr}` : undefined,
          description: item.description || '',
          images: fallbackImage ? JSON.stringify([fallbackImage]) : '[]',
          image: fallbackImage || null,
          brandId: brandId || undefined,
          categories: categoryId ? { connect: [{ id: categoryId }] } : undefined,
          deletedAt: null,
          deletedBy: null
        }
      });

      await prisma.inventoryLog.create({
        data: {
          productId: newProduct.id,
          sku: sku || '',
          previousStock: 0,
          newStock: stock,
          delta: stock,
          source: 'POS_ABSOLUTE',
          reason: 'Invi POS Initial Import',
          referenceId: remoteIdStr || 'INVI-INIT'
        }
      });

      if (rawVariants.length > 0) {
        await syncInviProductVariants(newProduct.id, rawVariants, price, logFn);
      }

      logFn && logFn(`✨ Created Product "${finalName}" (SKU: ${sku || 'N/A'}, Stock: ${stock}, Price: ৳${price})`);
      return 'created';
    }

    // 5b. Self-healing: if collision on inviId/externalId/sku occurred concurrently, update colliding record
    const colliding = await prisma.product.findFirst({
      where: {
        OR: [
          ...(remoteIdStr ? [{ inviId: remoteIdStr }, { externalId: `invi_${remoteIdStr}` }] : []),
          ...(sku ? [{ sku }] : [])
        ]
      }
    });

    if (colliding) {
      await prisma.product.update({
        where: { id: colliding.id },
        data: {
          name: finalName || colliding.name,
          price,
          comparePrice: comparePrice || colliding.comparePrice,
          stock,
          inviId: remoteIdStr || colliding.inviId,
          externalId: remoteIdStr ? `invi_${remoteIdStr}` : colliding.externalId,
          description: item.description || colliding.description,
          image: item.image || colliding.image,
          images: item.image ? JSON.stringify([item.image]) : colliding.images,
          brandId: brandId || colliding.brandId,
          categories: categoryId ? { set: [{ id: categoryId }] } : undefined,
          deletedAt: null,
          deletedBy: null,
          updatedAt: new Date()
        }
      });

      if (rawVariants.length > 0) {
        await syncInviProductVariants(colliding.id, rawVariants, price, logFn);
      }

      logFn && logFn(`✔️ Recovered & Updated existing record for "${finalName}"`);
      return 'updated';
    }

    throw createErr;
  }
}

/**
 * Fetches remote catalog from Invi POS and generates persistent ImportTask records in the database.
 */
export async function generateInviTasks(
  config: {
    targetUrl: string;
    apiKey: string;
    authType?: string;
    keyParamName?: string;
    productsRoute?: string;
  },
  perPage: number = 20,
  clearExisting: boolean = true
) {
  if (!config.targetUrl || !config.apiKey) {
    throw new Error('Target URL and API Key are required to generate Invi tasks.');
  }

  const cleanBase = config.targetUrl.replace(/\/$/, '');
  const rawRoute = (config.productsRoute || '/api/ecom/products/all').trim();
  const normalizedRoute = rawRoute.startsWith('/') ? rawRoute : `/${rawRoute}`;
  const urlObj = new URL(`${cleanBase}${normalizedRoute}`);

  if (config.authType === 'QUERY_PARAM') {
    urlObj.searchParams.set(config.keyParamName || 'consumer_key', config.apiKey);
  }

  const headers: Record<string, string> = {
    'User-Agent': 'Femcart-Invi-Bridge/1.0',
    'Accept': 'application/json, text/plain, */*'
  };

  if (config.authType === 'BEARER_TOKEN') {
    headers['Authorization'] = `Bearer ${config.apiKey}`;
  } else if (config.authType !== 'QUERY_PARAM') {
    headers[config.keyParamName || 'x-consumer-key'] = config.apiKey;
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 45000);

  const res = await fetch(urlObj.toString(), { headers, signal: controller.signal });
  clearTimeout(timeoutId);

  if (!res.ok) {
    throw new Error(`Invi POS server responded with HTTP ${res.status}: ${res.statusText}`);
  }

  const rawJson: any = await res.json().catch(() => null);
  let productsArray: any[] = [];

  if (Array.isArray(rawJson)) {
    productsArray = rawJson;
  } else if (rawJson && typeof rawJson === 'object') {
    if (Array.isArray(rawJson.data)) productsArray = rawJson.data;
    else if (Array.isArray(rawJson.items)) productsArray = rawJson.items;
    else if (Array.isArray(rawJson.products)) productsArray = rawJson.products;
    else if (Array.isArray(rawJson.results)) productsArray = rawJson.results;
    else if (Array.isArray(rawJson.records)) productsArray = rawJson.records;
    else if (rawJson.id || rawJson.sku || rawJson.name || rawJson.title) productsArray = [rawJson];
  }

  if (productsArray.length === 0) {
    throw new Error('No product items found at this Invi POS endpoint.');
  }

  // Pre-normalize all items
  const normalizedItems = productsArray.map((raw) => normalizeRemoteProductItem(raw, 'PRODUCT', cleanBase));

  if (clearExisting) {
    await prisma.importTask.deleteMany({
      where: { entityType: 'INVI_PRODUCTS' }
    });
  }

  const batchSize = Math.max(1, Math.min(perPage, 100));
  const chunks: any[][] = [];
  for (let i = 0; i < normalizedItems.length; i += batchSize) {
    chunks.push(normalizedItems.slice(i, i + batchSize));
  }

  const createdTasks = [];
  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i];
    const task = await prisma.importTask.create({
      data: {
        name: `Invi POS Batch #${i + 1} (${chunk.length} items)`,
        status: 'pending',
        pageNumber: i + 1,
        perPage: chunk.length,
        totalItems: chunk.length,
        imported: 0,
        failed: 0,
        details: JSON.stringify({
          items: chunk,
          logs: [`[${new Date().toLocaleTimeString('en-GB')}] 📦 Staged ${chunk.length} items for batch execution.`]
        }),
        entityType: 'INVI_PRODUCTS'
      }
    });
    createdTasks.push(task);
  }

  return {
    totalItems: normalizedItems.length,
    totalBatches: chunks.length,
    batchSize,
    tasks: createdTasks
  };
}
