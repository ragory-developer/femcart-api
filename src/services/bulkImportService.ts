import prisma from '../config/database';
import * as XLSX from 'xlsx';
import { CacheService } from '../core/redis/CacheService';
import { KeyFactory } from '../core/redis/KeyFactory';

export interface ColumnMapping {
  name?: string;
  slug?: string;
  sku?: string;
  price?: string;
  comparePrice?: string;
  specialPrice?: string;
  stock?: string;
  description?: string;
  shortDescription?: string;
  featured?: string;
  brand?: string;
  categories?: string;
  images?: string;
  specifications?: string;
  parentSku?: string;
  parentSlug?: string;
  variantAttributes?: string;

  // Order Fields
  orderId?: string;
  customerName?: string;
  customerEmail?: string;
  customerPhone?: string;
  deliveryAddress?: string;
  deliveryCity?: string;
  deliveryArea?: string;
  deliveryState?: string;
  paymentMethod?: string;
  paymentStatus?: string;
  total?: string;
  subtotal?: string;
  deliveryFee?: string;
  discount?: string;
  status?: string;
  items?: string;
}

function slugify(str: string): string {
  return str
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

async function uniqueSlug(base: string): Promise<string> {
  let slug = base;
  let counter = 1;
  while (true) {
    const found = await prisma.product.findUnique({ where: { slug } });
    if (!found) break;
    slug = `${base}-${counter++}`;
  }
  return slug;
}

function parseSpecifications(raw: any): string | null {
  if (!raw) return null;
  if (typeof raw === 'object') return JSON.stringify(raw);
  
  // Format expected: "Key1: Value1 | Value2, Key2: Value3"
  try {
    const specs: { name: string; value: string }[] = [];
    const parts = raw.toString().split(',');
    for (const part of parts) {
      const idx = part.indexOf(':');
      if (idx !== -1) {
        const name = part.substring(0, idx).trim();
        const value = part.substring(idx + 1).trim();
        if (name && value) {
          specs.push({ name, value });
        }
      }
    }
    return specs.length ? JSON.stringify(specs) : null;
  } catch {
    return null;
  }
}

async function getOrCreateBrand(name: string): Promise<string> {
  const slug = slugify(name);
  const brand = await prisma.brand.upsert({
    where: { slug },
    update: { name },
    create: { name, slug },
  });
  return brand.id;
}

async function getOrCreateCategory(path: string): Promise<string> {
  const parts = path.split('>').map((p) => p.trim()).filter(Boolean);
  if (parts.length === 0) return '';

  let parentId: string | null = null;
  let fullPath = "";
  let lastCategoryId = "";

  for (const part of parts) {
    fullPath = fullPath ? `${fullPath} ${part}` : part;
    const slug = slugify(fullPath);
    
    const cat: any = await prisma.category.upsert({
      where: { slug },
      update: { name: part, parentId },
      create: { name: part, slug, parentId },
    });
    
    parentId = cat.id;
    lastCategoryId = cat.id;
  }
  
  return lastCategoryId;
}

export function parseSpreadsheet(buffer: Buffer): any[] {
  const workbook = XLSX.read(buffer, { type: 'buffer', codepage: 65001 });
  const sheetName = workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];
  return XLSX.utils.sheet_to_json(sheet, { defval: '' });
}

export async function importProducts(
  rows: any[],
  mapping: any,
  logId: string
): Promise<{ imported: number; failed: number; errors: string[] }> {
  let imported = 0;
  let failed = 0;
  const errors: string[] = [];
  const BATCH_SIZE = 20;
  let batch: any[] = [];

  const nameCol = mapping.name || 'name';
  const priceCol = mapping.price || 'price';
  const skuCol = mapping.sku || 'sku';
  const slugCol = mapping.slug || 'slug';
  const descCol = mapping.description || 'description';
  const stockCol = mapping.stock || 'stock';
  const comparePriceCol = mapping.comparePrice || 'comparePrice';
  const brandCol = mapping.brand || 'brand';
  const catCol = mapping.categories || 'categories';
  const imgCol = mapping.images || 'images';
  const parentSkuCol = mapping.parentSku || 'parentSku';
  const varAttrCol = mapping.variantAttributes || 'variantAttributes';

  for (const row of rows) {
    try {
      const parentSku = row[parentSkuCol]?.toString().trim() || null;
      const isVariant = !!parentSku;

      const name = row[nameCol]?.toString().trim() || null;
      
      const rawPrice = parseFloat(row[priceCol]);
      let price = isNaN(rawPrice) ? null : rawPrice;

      const rawCompare = parseFloat(row[comparePriceCol]);
      const comparePrice = isNaN(rawCompare) ? null : rawCompare;

      const rawStock = parseInt(row[stockCol]);
      const stock = isNaN(rawStock) ? null : rawStock;

      const sku = row[skuCol]?.toString().trim() || null;
      const description = row[descCol]?.toString().trim() || null;
      const brandName = row[brandCol]?.toString().trim() || null;
      const categories = row[catCol]?.toString().trim() || null;
      
      const imgStrings = row[imgCol]?.toString().split(',') || [];
      const galleryImages = imgStrings.map((url: string) => url.trim()).filter(Boolean);
      const images = galleryImages.length ? JSON.stringify(galleryImages) : null;

      const optionsArr = [];
      if (isVariant) {
        const rawAttrs = row[varAttrCol]?.toString().split(',') || [];
        for (const attr of rawAttrs) {
          const idx = attr.indexOf(':');
          if (idx !== -1) {
            const attrName = attr.substring(0, idx).trim();
            const attrValue = attr.substring(idx + 1).trim();
            if (attrName && attrValue) {
              optionsArr.push({ name: attrName, value: attrValue });
            }
          }
        }
      }
      const options = optionsArr.length ? JSON.stringify(optionsArr) : null;

      const fieldErrors: any = {};
      if (!isVariant && !name) fieldErrors.name = "Parent product requires a name";
      
      const warnings: any = {};
      if (price === null) {
        price = 0;
        warnings.price = "Missing price set to 0. Please update.";
      } else if (price < 0) {
        fieldErrors.price = "Price cannot be negative";
      }

      if (isVariant && !sku && optionsArr.length === 0) {
         fieldErrors.sku = "Variant row is missing both unique SKU and Variant Attributes.";
      }

      const status = Object.keys(fieldErrors).length > 0 ? 'INVALID' : 'VALID';
      const finalErrors = { ...fieldErrors, ...warnings };

      batch.push({
        importLogId: logId,
        status,
        name,
        sku,
        price,
        comparePrice,
        stock,
        description,
        brandName,
        categories,
        images,
        parentSku,
        options,
        errors: Object.keys(finalErrors).length > 0 ? finalErrors : null
      });

      if (batch.length >= BATCH_SIZE) {
        await prisma.importStagingRow.createMany({ data: batch });
        imported += batch.length;
        await prisma.importLog.update({ where: { id: logId }, data: { imported } });
        batch = [];
      }
    } catch (e: any) {
      failed++;
      errors.push("Row error: " + e.message);
    }
  }

  if (batch.length > 0) {
    try {
      await prisma.importStagingRow.createMany({ data: batch });
      imported += batch.length;
    } catch (e: any) {
      failed++;
      errors.push("Final batch error: " + e.message);
    }
  }

  await prisma.importLog.update({ where: { id: logId }, data: { imported, failed, errors: errors.join('\n') } });
  return { imported, failed, errors };
}

export async function importOrders(
  rows: any[],
  mapping: ColumnMapping,
  logId: string
): Promise<{ imported: number; failed: number; errors: string[] }> {
  let imported = 0;
  let failed = 0;
  const errors: string[] = [];

  const orderIdCol = mapping.orderId || 'orderId';
  const nameCol = mapping.customerName || 'customerName';
  const emailCol = mapping.customerEmail || 'customerEmail';
  const phoneCol = mapping.customerPhone || 'customerPhone';
  const addrCol = mapping.deliveryAddress || 'deliveryAddress';
  const cityCol = mapping.deliveryCity || 'deliveryCity';
  const areaCol = mapping.deliveryArea || 'deliveryArea';
  const stateCol = mapping.deliveryState || 'deliveryState';
  const payMethodCol = mapping.paymentMethod || 'paymentMethod';
  const payStatusCol = mapping.paymentStatus || 'paymentStatus';
  const statusCol = mapping.status || 'status';
  const totalCol = mapping.total || 'total';
  const subtotalCol = mapping.subtotal || 'subtotal';
  const feeCol = mapping.deliveryFee || 'deliveryFee';
  const discountCol = mapping.discount || 'discount';
  const itemsCol = mapping.items || 'items';

  for (const row of rows) {
    try {
      const externalId = row[orderIdCol]?.toString().trim();
      if (!externalId) {
        throw new Error('Order ID is required for bulk order import.');
      }

      const email = row[emailCol]?.toString().trim() || null;
      const phone = row[phoneCol]?.toString().trim() || null;
      const customerName = row[nameCol]?.toString().trim() || 'Guest Customer';

      // 👤 Check or Auto-Create Guest User
      let user = null;
      if (email) {
        user = await prisma.user.findFirst({ where: { email } });
      }
      if (!user && phone) {
        user = await prisma.user.findFirst({ where: { phone } });
      }
      if (!user) {
        const placeholderEmail = email || `guest_${externalId}@imported.local`;
        user = await prisma.user.create({
          data: {
            name: customerName,
            email: placeholderEmail,
            phone,
            isGuest: true,
          }
        });
      }

      // Map Enum Fields
      const rawStatus = row[statusCol]?.toString().toUpperCase() || 'PENDING';
      const status = ['PENDING', 'CONFIRMED', 'PROCESSING', 'SHIPPED', 'DELIVERED', 'COMPLETED', 'RETURNED', 'PARTIALLY_RETURNED', 'CANCELLED'].includes(rawStatus)
        ? (rawStatus as any)
        : 'PENDING';

      const rawPayMethod = row[payMethodCol]?.toString().toUpperCase() || 'COD';
      const paymentMethod = ['COD', 'CARD', 'BKASH', 'NAGAD', 'STRIPE', 'PAYPAL'].includes(rawPayMethod)
        ? (rawPayMethod as any)
        : 'COD';

      const paymentStatus = row[payStatusCol]?.toString().toUpperCase() || 'UNPAID';

      const total = parseFloat(row[totalCol]) || 0;
      const subtotal = parseFloat(row[subtotalCol]) || total;
      const deliveryFee = parseFloat(row[feeCol]) || 0;
      const discount = parseFloat(row[discountCol]) || 0;

      const deliveryAddress = row[addrCol]?.toString().trim() || 'Imported Address';
      const deliveryCity = row[cityCol]?.toString().trim() || null;
      const deliveryArea = row[areaCol]?.toString().trim() || null;
      const deliveryState = row[stateCol]?.toString().trim() || null;

      const orderData = {
        userId: user.id,
        customerName,
        customerPhone: phone,
        externalId: `bulk_${externalId}`,
        externalSource: 'BULK_IMPORT',
        status,
        paymentMethod,
        paymentStatus,
        total,
        subtotal,
        deliveryFee,
        discount,
        deliveryAddress,
        deliveryCity,
        deliveryArea,
        deliveryState,
      };

      const existingOrder = await prisma.order.findUnique({
        where: { externalId: orderData.externalId }
      });

      let order;
      if (existingOrder) {
        order = await prisma.order.update({
          where: { id: existingOrder.id },
          data: orderData
        });
      } else {
        order = await prisma.order.create({
          data: orderData
        });
      }

      // 🛒 Parse and Add Line Items
      // Expected Item format: "SKU1:Qty1|Price1, SKU2:Qty2|Price2" or SKU-only
      const rawItems = row[itemsCol]?.toString().split(',') || [];
      
      // Clean previous items
      await prisma.orderItem.deleteMany({
        where: { orderId: order.id }
      });

      for (const rawItem of rawItems) {
        const parts = rawItem.split(':');
        const sku = parts[0]?.trim();
        if (sku) {
          let quantity = 1;
          let price = 0;

          if (parts[1]) {
            const details = parts[1].split('|');
            quantity = parseInt(details[0]) || 1;
            price = parseFloat(details[1]) || 0;
          }

          // Try matching SKU to product or variant
          const product = await prisma.product.findFirst({ where: { sku } });
          const variant = await prisma.productVariant.findFirst({ where: { sku } });

          const dbPrice = price || (variant ? variant.price : (product ? product.price : 0));

          await prisma.orderItem.create({
            data: {
              orderId: order.id,
              productId: product?.id || variant?.productId || null,
              variantId: variant?.id || null,
              quantity,
              price: dbPrice,
            }
          });
        }
      }

      imported++;
      await prisma.importLog.update({
        where: { id: logId },
        data: { imported, failed }
      });

    } catch (e: any) {
      failed++;
      errors.push(`Row error (Order ${row[orderIdCol]}): ${e.message}`);
      await prisma.importLog.update({
        where: { id: logId },
        data: { imported, failed, errors: errors.join('\n') }
      });
    }
  }

  return { imported, failed, errors };
}

export function validateSpreadsheetRows(
  rows: any[],
  mapping: ColumnMapping,
  importType: "PRODUCTS" | "ORDERS"
): string[] {
  const warnings: string[] = [];

  if (importType === "PRODUCTS") {
    const nameCol = mapping.name || "name";
    const priceCol = mapping.price || "price";
    const skuCol = mapping.sku || "sku";
    const stockCol = mapping.stock || "stock";
    const comparePriceCol = mapping.comparePrice || "comparePrice";
    const specialPriceCol = mapping.specialPrice || "specialPrice";
    const parentSkuCol = mapping.parentSku || "parentSku";
    const parentSlugCol = mapping.parentSlug || "parentSlug";
    const varAttrCol = mapping.variantAttributes || "variantAttributes";

    rows.forEach((row, idx) => {
      const lineNum = idx + 2; // header is line 1
      const name = row[nameCol]?.toString().trim();
      const parentSku = row[parentSkuCol]?.toString().trim();
      const parentSlug = row[parentSlugCol]?.toString().trim();
      const isVariant = !!(parentSku || parentSlug);

      if (!isVariant && !name) {
        warnings.push(`Row ${lineNum}: Product Name is missing.`);
      }

      const priceVal = parseFloat(row[priceCol]);
      if (!isVariant && isNaN(priceVal)) {
        warnings.push(`Row ${lineNum}: Price is missing or is not a valid number.`);
      } else if (priceVal < 0) {
        warnings.push(`Row ${lineNum}: Price cannot be negative.`);
      }

      const stockVal = parseInt(row[stockCol]);
      if (row[stockCol] && isNaN(stockVal)) {
        warnings.push(`Row ${lineNum}: Stock "${row[stockCol]}" is not a valid integer.`);
      }

      const compareVal = parseFloat(row[comparePriceCol]);
      if (row[comparePriceCol] && isNaN(compareVal)) {
        warnings.push(`Row ${lineNum}: Compare price "${row[comparePriceCol]}" is not a valid number.`);
      }

      const specialVal = parseFloat(row[specialPriceCol]);
      if (row[specialPriceCol] && isNaN(specialVal)) {
        warnings.push(`Row ${lineNum}: Special price "${row[specialPriceCol]}" is not a valid number.`);
      }

      if (isVariant) {
        const sku = row[skuCol]?.toString().trim();
        const attrs = row[varAttrCol]?.toString().trim();
        if (!sku && !attrs) {
          warnings.push(`Row ${lineNum}: Variant row is missing both unique SKU and Variant Attributes.`);
        }
      }
    });
  } else {
    const orderIdCol = mapping.orderId || "orderId";
    const totalCol = mapping.total || "total";
    const itemsCol = mapping.items || "items";

    rows.forEach((row, idx) => {
      const lineNum = idx + 2;
      const orderId = row[orderIdCol]?.toString().trim();
      if (!orderId) {
        warnings.push(`Row ${lineNum}: Order ID is missing.`);
      }

      const totalVal = parseFloat(row[totalCol]);
      if (isNaN(totalVal)) {
        warnings.push(`Row ${lineNum}: Total amount is missing or not a valid number.`);
      }

      const items = row[itemsCol]?.toString().trim();
      if (!items) {
        warnings.push(`Row ${lineNum}: Order Items (SKUs) column is missing.`);
      }
    });
  }

  return warnings;
}


export async function commitStagingToProducts(logId: string, includeInvalid: boolean = false) {
  let committed = 0;
  let failed = 0;

  const statusFilter = { in: includeInvalid ? ['VALID', 'INVALID'] : ['VALID'] };

  const totalValid = await prisma.importStagingRow.count({
    where: { importLogId: logId, status: statusFilter }
  });

  if (totalValid === 0) {
    return { committed, failed };
  }
  
  await prisma.importLog.update({ 
    where: { id: logId }, 
    data: { totalProducts: totalValid, imported: 0, failed: 0 } 
  });

  const BATCH_SIZE = 20;

  // 1. Process Parents first using ID chunking to avoid memory limits and infinite loops
  const parentIds = (await prisma.importStagingRow.findMany({
    where: { importLogId: logId, status: statusFilter, parentSku: null },
    select: { id: true }
  })).map(r => r.id);

  for (let i = 0; i < parentIds.length; i += BATCH_SIZE) {
    const chunkIds = parentIds.slice(i, i + BATCH_SIZE);
    const parentBatch = await prisma.importStagingRow.findMany({
      where: { id: { in: chunkIds } }
    });

    for (const row of parentBatch) {
      try {
        const safeName = row.name || 'Untitled Product';
        const baseSlug = (row as any).slug || safeName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)+/g, '');
        
        const existingBySku = row.sku ? await prisma.product.findFirst({ where: { sku: row.sku } }) : null;
        
        let slug = existingBySku ? existingBySku.slug : baseSlug || `product-${Date.now()}`;
        let existingBySlug = await prisma.product.findUnique({ where: { slug } });
        let counter = 1;
        while (!existingBySku && existingBySlug) {
          slug = `${baseSlug}-${counter}`;
          existingBySlug = await prisma.product.findUnique({ where: { slug } });
          counter++;
        }
        
        const existing = existingBySku || existingBySlug;

        const productData = {
          name: safeName,
          slug,
          sku: row.sku,
          price: row.price ?? 0,
          comparePrice: row.comparePrice ?? null,
          stock: row.stock ?? 0,
          description: row.description ?? '',
          brandId: row.brandName ? await getOrCreateBrand(row.brandName) : null,
          image: row.images ? (() => { try { return JSON.parse(row.images)[0]; } catch { return null; } })() : null,
          images: row.images ?? '[]',
          specialPrice: row.comparePrice ? row.price : null,
          productType: 'SIMPLE' as any,
        };

        const categoryConnections: { id: string }[] = [];
        if (row.categories) {
          const catNames = row.categories.split(',').filter(Boolean);
          for (const cat of catNames) {
            categoryConnections.push({ id: await getOrCreateCategory(cat.trim()) });
          }
        }

        if (existing) {
          await prisma.product.update({
            where: { id: existing.id },
            data: { ...productData, categories: { set: categoryConnections } }
          });
        } else {
          await prisma.product.create({
            data: { ...productData, categories: { connect: categoryConnections } }
          });
        }

        await prisma.importStagingRow.update({
          where: { id: row.id },
          data: { status: 'IMPORTED' }
        });
        committed++;
        
        if (committed % 20 === 0) {
          await prisma.importLog.update({ where: { id: logId }, data: { imported: committed, failed } });
        }
      } catch (e: any) {
        failed++;
        await prisma.importStagingRow.update({
          where: { id: row.id },
          data: { status: 'INVALID', errors: { system: e.message } }
        });
        
        if (failed % 20 === 0) {
          await prisma.importLog.update({ where: { id: logId }, data: { imported: committed, failed } });
        }
      }
    }
  }

  // 2. Process Variants using the exact same ID chunking
  const variantIds = (await prisma.importStagingRow.findMany({
    where: { importLogId: logId, status: statusFilter, parentSku: { not: null } },
    select: { id: true }
  })).map(r => r.id);

  for (let i = 0; i < variantIds.length; i += BATCH_SIZE) {
    const chunkIds = variantIds.slice(i, i + BATCH_SIZE);
    const variantBatch = await prisma.importStagingRow.findMany({
      where: { id: { in: chunkIds } }
    });

    for (const row of variantBatch) {
      try {
        let parent = null;
        if (row.parentSku) {
          parent = await prisma.product.findFirst({ where: { sku: row.parentSku } });
          if (!parent) parent = await prisma.product.findUnique({ where: { slug: row.parentSku } });
        }

        if (!parent) {
          failed++;
          await prisma.importStagingRow.update({
            where: { id: row.id },
            data: { status: 'INVALID', errors: { parent: 'Parent product not found in database or staging.' } }
          });
          continue;
        }

        if (parent.productType === 'SIMPLE') {
          await prisma.product.update({ where: { id: parent.id }, data: { productType: 'VARIABLE' } });
        }

        const parsedAttrs = row.options ? JSON.parse(row.options) : [];
        let existingVariant = null;
        if (row.sku) {
          existingVariant = await prisma.productVariant.findFirst({ 
            where: { sku: row.sku, productId: parent.id } 
          });
        } else if (parsedAttrs.length > 0) {
          const parentVariants = await prisma.productVariant.findMany({
            where: { productId: parent.id },
            include: { attributes: true }
          });
          existingVariant = parentVariants.find(v => {
            if (v.attributes.length !== parsedAttrs.length) return false;
            return parsedAttrs.every((pa: any) => 
              v.attributes.some((va: any) => 
                va.name.toLowerCase() === pa.name.toLowerCase() && 
                va.value.toLowerCase() === pa.value.toLowerCase()
              )
            );
          }) || null;
        }

        const vData: any = {
          productId: parent.id,
          sku: row.sku || `VAR-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
          price: row.price ?? parent.price,
          specialPrice: row.comparePrice ? row.price : null,
          stock: row.stock ?? 0,
          image: row.images ? (() => {
            try {
              const arr = JSON.parse(row.images);
              return arr[0] || null;
            } catch { return null; }
          })() : null,
        };

        let variant;
        if (existingVariant) {
          variant = await prisma.productVariant.update({ where: { id: existingVariant.id }, data: vData });
        } else {
          variant = await prisma.productVariant.create({ data: vData });
        }

        if (parsedAttrs.length > 0) {
          await prisma.variantAttribute.deleteMany({ where: { variantId: variant.id } });
          await prisma.variantAttribute.createMany({
            data: parsedAttrs.map((pa: any) => ({
              variantId: variant.id,
              name: pa.name,
              value: pa.value,
            }))
          });
        }

        await prisma.importStagingRow.update({
          where: { id: row.id },
          data: { status: 'IMPORTED' }
        });
        committed++;
        if (committed % 20 === 0) {
          await prisma.importLog.update({ where: { id: logId }, data: { imported: committed, failed } });
        }
      } catch (e: any) {
        failed++;
        await prisma.importStagingRow.update({
          where: { id: row.id },
          data: { status: 'INVALID', errors: { system: e.message } }
        });
        if (failed % 20 === 0) {
          await prisma.importLog.update({ where: { id: logId }, data: { imported: committed, failed } });
        }
      }
    }
  }

  await prisma.importLog.update({ 
    where: { id: logId }, 
    data: { status: 'completed', imported: committed, failed, totalProducts: committed + failed } 
  });
  
  // Invalidate product cache to reflect bulk imported products and variants immediately
  await CacheService.incr(KeyFactory.productCacheVersion());

  return { committed, failed };
}
