import prisma from '../config/database';
import { slugify } from '../utils/helpers';
import { ProductType } from '@prisma/client';

async function uniqueSlug(base: string): Promise<string> {
  let slug = base;
  let counter = 1;
  while (true) {
    const existing = await prisma.product.findUnique({ where: { slug } });
    if (!existing) return slug;
    slug = `${base}-${counter}`;
    counter++;
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

export async function importShopifyProducts(
  rows: any[],
  logId: string
): Promise<{ imported: number; failed: number; errors: string[] }> {
  let imported = 0;
  let failed = 0;
  const errors: string[] = [];
  
  const BATCH_SIZE = 20;
  let batch: any[] = [];
  const productCache: Record<string, { opt1?: string, opt2?: string, opt3?: string, brand?: string, cats?: string }> = {};

  for (const row of rows) {
    try {
      const handle = row['Handle']?.toString().trim();
      const title = row['Title']?.toString().trim();
      const name = title || handle; // Shopify uses handle for variations

      const priceVal = parseFloat(row['Variant Price']);
      let price = isNaN(priceVal) ? null : priceVal;

      const compareVal = parseFloat(row['Variant Compare At Price']);
      const comparePrice = isNaN(compareVal) ? null : compareVal;

      const stockVal = parseInt(row['Variant Inventory Qty']);
      const stock = isNaN(stockVal) ? null : stockVal;

      const description = row['Body (HTML)']?.toString().trim();
      let brandName = row['Vendor']?.toString().trim();
      let categories = row['Type']?.toString().trim() || row['Custom Product Type']?.toString().trim() || row['Standardized Product Type']?.toString().trim() || row['Tags']?.toString().trim();
      const images = row['Image Src']?.toString().trim();
      const sku = row['Variant SKU']?.toString().trim();

      if (handle && !productCache[handle]) {
        productCache[handle] = {};
      }

      if (brandName && handle) productCache[handle].brand = brandName;
      else if (!brandName && handle) brandName = productCache[handle].brand;

      if (categories && handle) productCache[handle].cats = categories;
      else if (!categories && handle) categories = productCache[handle].cats;

      const opt1Name = row[`Option1 Name`]?.toString().trim() || (handle ? productCache[handle].opt1 : undefined);
      if (row[`Option1 Name`]?.toString().trim() && handle) productCache[handle].opt1 = row[`Option1 Name`].toString().trim();

      const opt2Name = row[`Option2 Name`]?.toString().trim() || (handle ? productCache[handle].opt2 : undefined);
      if (row[`Option2 Name`]?.toString().trim() && handle) productCache[handle].opt2 = row[`Option2 Name`].toString().trim();

      const opt3Name = row[`Option3 Name`]?.toString().trim() || (handle ? productCache[handle].opt3 : undefined);
      if (row[`Option3 Name`]?.toString().trim() && handle) productCache[handle].opt3 = row[`Option3 Name`].toString().trim();

      const optionsArr = [];
      const opt1Val = row[`Option1 Value`]?.toString().trim();
      if (opt1Name && opt1Val && opt1Name.toLowerCase() !== 'title' && opt1Val.toLowerCase() !== 'default title') {
        optionsArr.push({ name: opt1Name, value: opt1Val });
      }
      const opt2Val = row[`Option2 Value`]?.toString().trim();
      if (opt2Name && opt2Val && opt2Name.toLowerCase() !== 'title' && opt2Val.toLowerCase() !== 'default title') {
        optionsArr.push({ name: opt2Name, value: opt2Val });
      }
      const opt3Val = row[`Option3 Value`]?.toString().trim();
      if (opt3Name && opt3Val && opt3Name.toLowerCase() !== 'title' && opt3Val.toLowerCase() !== 'default title') {
        optionsArr.push({ name: opt3Name, value: opt3Val });
      }
      const options = optionsArr.length ? JSON.stringify(optionsArr) : null;

      // Handle Gallery Images: Rows with no title and no options but an image
      if (!title && !opt1Val && images && handle) {
        // Find the parent row in the current batch
        const parentRow = batch.find(r => r.slug === handle && r.parentSku === null);
        if (parentRow) {
          try {
            const parsedImages = parentRow.images ? JSON.parse(parentRow.images) : [];
            parsedImages.push(images);
            parentRow.images = JSON.stringify(parsedImages);
          } catch (e) {
            // Ignore parse error
          }
        }
        // Skip creating a new row for this gallery image
        continue;
      }

      const fieldErrors: any = {};
      if (!name) fieldErrors.name = "Name or Handle is required";
      
      const warnings: any = {};
      if (price === null) {
        price = 0;
        warnings.price = "Missing price set to 0. Please update.";
      } else if (price < 0) {
        fieldErrors.price = "Price cannot be negative";
      }

      const status = Object.keys(fieldErrors).length > 0 ? 'INVALID' : 'VALID';
      const finalErrors = { ...fieldErrors, ...warnings };

      const dataPayload: any = {
          importLogId: logId,
          status,
          name,
          slug: handle,
          sku,
          price,
          comparePrice,
          stock,
          description,
          brandName,
          categories,
          images: images ? JSON.stringify([images]) : null,
          parentSku: !title && handle ? handle : null,
          options,
          errors: Object.keys(finalErrors).length > 0 ? finalErrors : null
      };

      batch.push(dataPayload);
      
      if (batch.length >= BATCH_SIZE) {
        await prisma.importStagingRow.createMany({ data: batch });
        imported += batch.length;
        await prisma.importLog.update({ where: { id: logId }, data: { imported } });
        batch = [];
      }
    } catch (e: any) {
      failed++;
      errors.push(`Row error: ${e.message}`);
    }
  }

  if (batch.length > 0) {
    try {
      await prisma.importStagingRow.createMany({ data: batch });
      imported += batch.length;
    } catch (e: any) {
      failed += batch.length;
      errors.push(`Final batch error: ${e.message}`);
    }
  }

  await prisma.importLog.update({ where: { id: logId }, data: { imported, failed, errors: errors.join('\n') } });
  return { imported, failed, errors };
}

export async function importWooProducts(
  rows: any[],
  logId: string
): Promise<{ imported: number; failed: number; errors: string[] }> {
  let imported = 0;
  let failed = 0;
  const errors: string[] = [];
  const BATCH_SIZE = 20;
  let batch: any[] = [];

  for (const row of rows) {
    try {
      const type = row['Type']?.toString().toLowerCase();
      const isVariant = type === 'variation';

      const name = row['Name']?.toString().trim();
      let priceVal = parseFloat(row['Regular price']);
      let price = isNaN(priceVal) ? null : priceVal;
      
      const specialVal = parseFloat(row['Sale price']);
      const comparePrice = isNaN(specialVal) ? null : specialVal; // Map sale price logic properly in commit phase

      const stockVal = parseInt(row['Stock']);
      const stock = isNaN(stockVal) ? null : stockVal;

      const description = row['Description']?.toString().trim();
      const sku = row['SKU']?.toString().trim();
      const imagesStr = row['Images']?.toString().trim();
      const images = imagesStr ? JSON.stringify(imagesStr.split(',').map((u: string) => u.trim()).filter(Boolean)) : null;

      const categories = row['Categories']?.toString().trim();
      const parentSku = isVariant ? row['Parent']?.toString().trim() : null;

      const optionsArr = [];
      if (isVariant) {
        for (let i = 1; i <= 5; i++) {
          const optName = row[`Attribute ${i} name`]?.toString().trim();
          const optVal = row[`Attribute ${i} value(s)`]?.toString().trim();
          if (optName && optVal) optionsArr.push({ name: optName, value: optVal });
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
    } catch(e: any) {
      failed++;
      errors.push(`Row error: ${e.message}`);
    }
  }

  if (batch.length > 0) {
    try {
      await prisma.importStagingRow.createMany({ data: batch });
      imported += batch.length;
    } catch (e: any) {
      failed += batch.length;
      errors.push(`Final batch error: ${e.message}`);
    }
  }

  await prisma.importLog.update({ where: { id: logId }, data: { imported, failed, errors: errors.join('\n') } });
  return { imported, failed, errors };
}

export async function importShopifyOrders(
  rows: any[],
  logId: string
): Promise<{ imported: number; failed: number; errors: string[] }> {
  let imported = 0;
  let failed = 0;
  const errors: string[] = [];

  const groupedByName: Record<string, any[]> = {};
  for (const row of rows) {
    const name = row['Name']?.toString().trim();
    if (name) {
      if (!groupedByName[name]) groupedByName[name] = [];
      groupedByName[name].push(row);
    }
  }

  for (const orderName of Object.keys(groupedByName)) {
    try {
      const groupRows = groupedByName[orderName];
      const parentRow = groupRows[0];

      const email = parentRow['Email']?.toString().trim();
      const phone = parentRow['Phone']?.toString().trim() || parentRow['Shipping Phone']?.toString().trim();
      
      let user = null;
      if (email) user = await prisma.user.findFirst({ where: { email } });
      if (!user && phone) user = await prisma.user.findFirst({ where: { phone } });
      
      if (!user) {
        user = await prisma.user.create({
          data: {
            email: email || `guest_${orderName}@imported.local`,
            phone,
            name: (parentRow['Shipping Name']?.toString() || 'Guest').trim(),
            password: 'NO_LOGIN',
            role: 'USER'
          }
        });
      }

      const totalVal = parseFloat(parentRow['Total']);
      const total = isNaN(totalVal) ? 0 : totalVal;

      const order = await prisma.order.upsert({
        where: { externalId: `shopify_${orderName}` },
        update: { total, userId: user.id },
        create: {
          externalId: `shopify_${orderName}`,
          userId: user.id,
          total,
          subtotal: total,
          status: 'COMPLETED',
          paymentStatus: parentRow['Financial Status']?.toString().toLowerCase() === 'paid' ? 'PAID' : 'UNPAID',
          deliveryAddress: `${parentRow['Shipping Street'] || ''} ${parentRow['Shipping City'] || ''}`.trim()
        }
      });

      await prisma.orderItem.deleteMany({ where: { orderId: order.id } });

      for (const itemRow of groupRows) {
        const sku = itemRow['Lineitem sku']?.toString().trim();
        const quantityVal = parseInt(itemRow['Lineitem quantity']);
        const quantity = isNaN(quantityVal) ? 1 : quantityVal;
        const priceVal = parseFloat(itemRow['Lineitem price']);
        const price = isNaN(priceVal) ? 0 : priceVal;

        let productId = null;
        let variantId = null;

        if (sku) {
          const v = await prisma.productVariant.findFirst({ where: { sku } });
          if (v) {
            variantId = v.id;
            productId = v.productId;
          } else {
            const p = await prisma.product.findFirst({ where: { sku } });
            if (p) productId = p.id;
          }
        }

        await prisma.orderItem.create({
          data: {
            orderId: order.id,
            productId,
            variantId,
            quantity,
            price
          }
        });
      }

      imported++;
      await prisma.importLog.update({ where: { id: logId }, data: { imported, failed } });

    } catch (e: any) {
      failed++;
      errors.push(`Shopify Order [${orderName}] error: ${e.message}`);
      await prisma.importLog.update({ where: { id: logId }, data: { imported, failed, errors: errors.join('\n') } });
    }
  }

  return { imported, failed, errors };
}

export async function importWooOrders(
  rows: any[],
  logId: string
): Promise<{ imported: number; failed: number; errors: string[] }> {
  let imported = 0;
  let failed = 0;
  const errors: string[] = [];

  for (const row of rows) {
    try {
      const orderId = row['Order ID']?.toString().trim();
      if (!orderId) continue;

      const email = row['Customer email']?.toString().trim();
      let user = email ? await prisma.user.findFirst({ where: { email } }) : null;
      if (!user) {
        user = await prisma.user.create({
          data: {
            email: email || `guest_${orderId}@imported.local`,
            name: `${row['Billing first name'] || ''} ${row['Billing last name'] || ''}`.trim() || 'Guest',
            password: 'NO_LOGIN',
            role: 'USER'
          }
        });
      }

      const totalVal = parseFloat(row['Order total']);
      
      const order = await prisma.order.upsert({
        where: { externalId: `woo_${orderId}` },
        update: { total: isNaN(totalVal) ? 0 : totalVal },
        create: {
          externalId: `woo_${orderId}`,
          userId: user.id,
          total: isNaN(totalVal) ? 0 : totalVal,
          subtotal: isNaN(totalVal) ? 0 : totalVal,
          status: 'COMPLETED',
          paymentStatus: 'PAID',
          deliveryAddress: `${row['Shipping address 1'] || ''} ${row['Shipping city'] || ''}`.trim()
        }
      });

      imported++;
      await prisma.importLog.update({ where: { id: logId }, data: { imported, failed } });
    } catch(e: any) {
      failed++;
      errors.push(`Woo Order error: ${e.message}`);
      await prisma.importLog.update({ where: { id: logId }, data: { imported, failed, errors: errors.join('\n') } });
    }
  }
  return { imported, failed, errors };
}
