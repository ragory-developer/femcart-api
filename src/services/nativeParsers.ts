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

async function getOrCreateCategory(name: string): Promise<string> {
  const slug = slugify(name);
  const category = await prisma.category.upsert({
    where: { slug },
    update: { name },
    create: { name, slug },
  });
  return category.id;
}

export async function importShopifyProducts(
  rows: any[],
  logId: string
): Promise<{ imported: number; failed: number; errors: string[] }> {
  let imported = 0;
  let failed = 0;
  const errors: string[] = [];

  const groupedByHandle: Record<string, any[]> = {};
  for (const row of rows) {
    const handle = row['Handle']?.toString().trim();
    if (handle) {
      if (!groupedByHandle[handle]) groupedByHandle[handle] = [];
      groupedByHandle[handle].push(row);
    }
  }

  for (const handle of Object.keys(groupedByHandle)) {
    try {
      const groupRows = groupedByHandle[handle];
      const parentRow = groupRows[0];
      
      const name = parentRow['Title']?.toString().trim() || handle;
      if (!name) continue;

      const priceVal = parseFloat(parentRow['Variant Price']);
      const price = isNaN(priceVal) ? 0 : priceVal;

      const compareVal = parseFloat(parentRow['Variant Compare At Price']);
      const comparePrice = isNaN(compareVal) ? null : compareVal;

      const stockVal = parseInt(parentRow['Variant Inventory Qty']);
      const stock = isNaN(stockVal) ? 0 : stockVal;

      const description = parentRow['Body (HTML)']?.toString().trim() || '';
      
      let brandId = null;
      const vendor = parentRow['Vendor']?.toString().trim();
      if (vendor) brandId = await getOrCreateBrand(vendor);

      let catId = null;
      const type = parentRow['Custom Product Type']?.toString().trim() || parentRow['Standardized Product Type']?.toString().trim();
      if (type) catId = await getOrCreateCategory(type);
      
      const mainImage = parentRow['Image Src']?.toString().trim() || null;
      const galleryImages = groupRows
        .map(r => r['Image Src']?.toString().trim())
        .filter(Boolean);

      const sku = parentRow['Variant SKU']?.toString().trim() || null;
      const existing = sku 
        ? await prisma.product.findFirst({ where: { sku } })
        : await prisma.product.findUnique({ where: { slug: handle } });
        
      const slug = existing ? existing.slug : await uniqueSlug(handle);

      const productData = {
        name,
        slug,
        price,
        comparePrice,
        stock,
        description,
        brandId,
        image: mainImage,
        images: JSON.stringify(galleryImages),
        productType: groupRows.length > 1 ? ProductType.VARIABLE : ProductType.SIMPLE,
      };

      let product;
      if (existing) {
        product = await prisma.product.update({
          where: { id: existing.id },
          data: { ...productData, categories: catId ? { set: [{ id: catId }] } : undefined }
        });
      } else {
        product = await prisma.product.create({
          data: { ...productData, categories: catId ? { connect: [{ id: catId }] } : undefined }
        });
      }

      for (const vRow of groupRows) {
        const vSku = vRow['Variant SKU']?.toString().trim() || null;
        const vPrice = parseFloat(vRow['Variant Price']) || price;
        const vCompare = parseFloat(vRow['Variant Compare At Price']) || null;
        const vStock = parseInt(vRow['Variant Inventory Qty']) || 0;
        const vImage = vRow['Image Src']?.toString().trim() || null;

        const options: { name: string, value: string }[] = [];
        for (let i = 1; i <= 3; i++) {
          const optName = vRow[`Option${i} Name`]?.toString().trim();
          const optVal = vRow[`Option${i} Value`]?.toString().trim();
          if (optName && optVal && optName.toLowerCase() !== 'title' && optVal.toLowerCase() !== 'default title') {
            options.push({ name: optName, value: optVal });
          }
        }

        if (groupRows.length === 1 && options.length === 0) {
           // Skip creating variant for a simple product with no options
           continue; 
        }

        let existingVariant = null;
        if (vSku) {
          existingVariant = await prisma.productVariant.findFirst({ where: { sku: vSku } });
        } else if (options.length > 0) {
           const parentVariants = await prisma.productVariant.findMany({
             where: { productId: product.id }, include: { attributes: true }
           });
           existingVariant = parentVariants.find(v => {
             if (v.attributes.length !== options.length) return false;
             return options.every(o => v.attributes.some(a => a.name.toLowerCase() === o.name.toLowerCase() && a.value.toLowerCase() === o.value.toLowerCase()));
           });
        }

        const vData = {
          productId: product.id,
          sku: vSku,
          price: vPrice,
          comparePrice: vCompare,
          stock: vStock,
          image: vImage,
        };

        let variant;
        if (existingVariant) {
           variant = await prisma.productVariant.update({ where: { id: existingVariant.id }, data: vData });
        } else {
           variant = await prisma.productVariant.create({ data: vData });
        }

        await prisma.variantAttribute.deleteMany({ where: { variantId: variant.id } });
        for (const opt of options) {
           await prisma.variantAttribute.create({ data: { variantId: variant.id, name: opt.name, value: opt.value } });
        }
      }

      imported++;
      await prisma.importLog.update({ where: { id: logId }, data: { imported, failed } });

    } catch(e: any) {
      failed++;
      errors.push(`Error on Shopify Handle [${handle}]: ${e.message}`);
      await prisma.importLog.update({ where: { id: logId }, data: { imported, failed, errors: errors.join('\n') } });
    }
  }

  return { imported, failed, errors };
}

export async function importWooProducts(
  rows: any[],
  logId: string
): Promise<{ imported: number; failed: number; errors: string[] }> {
  let imported = 0;
  let failed = 0;
  const errors: string[] = [];

  const parents = rows.filter(r => r['Type']?.toString().toLowerCase() !== 'variation');
  const variants = rows.filter(r => r['Type']?.toString().toLowerCase() === 'variation');
  const wooSkuToProductId: Record<string, string> = {};

  for (const row of parents) {
    try {
      const name = row['Name']?.toString().trim();
      if (!name) continue;

      const priceVal = parseFloat(row['Regular price']);
      const price = isNaN(priceVal) ? 0 : priceVal;
      const specialVal = parseFloat(row['Sale price']);
      const specialPrice = isNaN(specialVal) ? null : specialVal;
      const stockVal = parseInt(row['Stock']);
      const stock = isNaN(stockVal) ? 0 : stockVal;

      const description = row['Description']?.toString().trim() || '';
      const shortDescription = row['Short description']?.toString().trim() || '';
      const sku = row['SKU']?.toString().trim() || null;
      
      const images = row['Images']?.toString().split(',').map((u: string) => u.trim()).filter(Boolean) || [];
      const mainImage = images[0] || null;

      const catNames = row['Categories']?.toString().split(',').map((c: string) => c.trim()).filter(Boolean) || [];
      const categoryConnections: { id: string }[] = [];
      for (const c of catNames) categoryConnections.push({ id: await getOrCreateCategory(c) });

      const baseSlug = slugify(name);
      const existing = sku ? await prisma.product.findFirst({ where: { sku } }) : await prisma.product.findUnique({ where: { slug: baseSlug } });
      const slug = existing ? existing.slug : await uniqueSlug(baseSlug);

      const isVariable = row['Type']?.toString().toLowerCase() === 'variable';

      const pData = {
        name, slug, sku, price, specialPrice, stock, description, shortDescription, image: mainImage, images: JSON.stringify(images), productType: isVariable ? ProductType.VARIABLE : ProductType.SIMPLE
      };

      let product;
      if (existing) {
        product = await prisma.product.update({ where: { id: existing.id }, data: { ...pData, categories: { set: categoryConnections } } });
      } else {
        product = await prisma.product.create({ data: { ...pData, categories: { connect: categoryConnections } } });
      }

      if (sku) wooSkuToProductId[sku] = product.id;
      if (row['ID']) wooSkuToProductId[row['ID']?.toString().trim()] = product.id;

      imported++;
      await prisma.importLog.update({ where: { id: logId }, data: { imported, failed } });
    } catch(e: any) {
      failed++;
      errors.push(`Woo Parent error: ${e.message}`);
      await prisma.importLog.update({ where: { id: logId }, data: { imported, failed, errors: errors.join('\n') } });
    }
  }

  for (const row of variants) {
     try {
       const parentRef = row['Parent']?.toString().trim();
       let productId = parentRef ? wooSkuToProductId[parentRef] : null;
       
       if (!productId && parentRef) {
         const p = await prisma.product.findFirst({ where: { sku: parentRef } });
         if (p) productId = p.id;
       }

       if (!productId) continue;

       const vSku = row['SKU']?.toString().trim() || null;
       const vPrice = parseFloat(row['Regular price']) || 0;
       const vSpecial = parseFloat(row['Sale price']) || null;
       const vStock = parseInt(row['Stock']) || 0;
       const vImage = row['Images']?.toString().split(',')[0]?.trim() || null;

       const options: { name: string, value: string }[] = [];
       for (let i = 1; i <= 5; i++) {
         const optName = row[`Attribute ${i} name`]?.toString().trim();
         const optVal = row[`Attribute ${i} value(s)`]?.toString().trim();
         if (optName && optVal) options.push({ name: optName, value: optVal });
       }

       let existingVariant = null;
        if (vSku) {
          existingVariant = await prisma.productVariant.findFirst({ where: { sku: vSku } });
        } else if (options.length > 0) {
           const parentVariants = await prisma.productVariant.findMany({
             where: { productId }, include: { attributes: true }
           });
           existingVariant = parentVariants.find(v => {
             if (v.attributes.length !== options.length) return false;
             return options.every(o => v.attributes.some(a => a.name.toLowerCase() === o.name.toLowerCase() && a.value.toLowerCase() === o.value.toLowerCase()));
           });
        }

        const vData = {
          productId,
          sku: vSku,
          price: vPrice,
          specialPrice: vSpecial,
          stock: vStock,
          image: vImage,
        };

        let variant;
        if (existingVariant) {
           variant = await prisma.productVariant.update({ where: { id: existingVariant.id }, data: vData });
        } else {
           variant = await prisma.productVariant.create({ data: vData });
        }

        await prisma.variantAttribute.deleteMany({ where: { variantId: variant.id } });
        for (const opt of options) {
           await prisma.variantAttribute.create({ data: { variantId: variant.id, name: opt.name, value: opt.value } });
        }
     } catch (e: any) {
        failed++;
        errors.push(`Woo Variant error: ${e.message}`);
        await prisma.importLog.update({ where: { id: logId }, data: { imported, failed, errors: errors.join('\n') } });
     }
  }

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
