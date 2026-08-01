import prisma from '../config/database';
import * as XLSX from 'xlsx';

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

async function getOrCreateCategory(name: string): Promise<string> {
  const slug = slugify(name);
  const category = await prisma.category.upsert({
    where: { slug },
    update: { name },
    create: { name, slug },
  });
  return category.id;
}

export function parseSpreadsheet(buffer: Buffer): any[] {
  const workbook = XLSX.read(buffer, { type: 'buffer' });
  const sheetName = workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];
  return XLSX.utils.sheet_to_json(sheet, { defval: '' });
}

export async function importProducts(
  rows: any[],
  mapping: ColumnMapping,
  logId: string
): Promise<{ imported: number; failed: number; errors: string[] }> {
  let imported = 0;
  let failed = 0;
  const errors: string[] = [];

  const nameCol = mapping.name || 'name';
  const priceCol = mapping.price || 'price';
  const skuCol = mapping.sku || 'sku';
  const slugCol = mapping.slug || 'slug';
  const descCol = mapping.description || 'description';
  const shortDescCol = mapping.shortDescription || 'shortDescription';
  const stockCol = mapping.stock || 'stock';
  const comparePriceCol = mapping.comparePrice || 'comparePrice';
  const specialPriceCol = mapping.specialPrice || 'specialPrice';
  const featuredCol = mapping.featured || 'featured';
  const brandCol = mapping.brand || 'brand';
  const catCol = mapping.categories || 'categories';
  const imgCol = mapping.images || 'images';
  const specCol = mapping.specifications || 'specifications';
  const parentSkuCol = mapping.parentSku || 'parentSku';
  const parentSlugCol = mapping.parentSlug || 'parentSlug';
  const varAttrCol = mapping.variantAttributes || 'variantAttributes';

  // PASS 1: Import Parent/Simple Products
  const parentRows = rows.filter(row => !row[parentSkuCol] && !row[parentSlugCol]);
  
  for (const row of parentRows) {
    try {
      const name = row[nameCol]?.toString().trim();
      if (!name) {
        throw new Error('Product name is required.');
      }

      const rawPrice = parseFloat(row[priceCol]);
      const price = isNaN(rawPrice) ? 0 : rawPrice;

      const rawCompare = parseFloat(row[comparePriceCol]);
      const comparePrice = isNaN(rawCompare) ? null : rawCompare;

      const rawSpecial = parseFloat(row[specialPriceCol]);
      const specialPrice = isNaN(rawSpecial) ? null : rawSpecial;

      const rawStock = parseInt(row[stockCol]);
      const stock = isNaN(rawStock) ? 0 : rawStock;

      const sku = row[skuCol]?.toString().trim() || null;
      const baseSlug = row[slugCol]?.toString().trim() || slugify(name);
      
      const description = row[descCol]?.toString().trim() || '';
      const shortDescription = row[shortDescCol]?.toString().trim() || '';
      const featured = row[featuredCol]?.toString().toLowerCase() === 'true';

      const specs = parseSpecifications(row[specCol]);

      // Category links
      const categoryConnections: { id: string }[] = [];
      const catNames = row[catCol]?.toString().split(',') || [];
      for (const catName of catNames) {
        const trimmed = catName.trim();
        if (trimmed) {
          const catId = await getOrCreateCategory(trimmed);
          categoryConnections.push({ id: catId });
        }
      }

      // Brand link
      let brandId: string | null = null;
      const brandName = row[brandCol]?.toString().trim();
      if (brandName) {
        brandId = await getOrCreateBrand(brandName);
      }

      // Process Images
      const imgStrings = row[imgCol]?.toString().split(',') || [];
      const galleryImages = imgStrings.map((url: string) => url.trim()).filter(Boolean);
      const mainImage = galleryImages[0] || null;

      // Check external slug safety
      const existing = sku 
        ? await prisma.product.findFirst({ where: { sku } })
        : await prisma.product.findUnique({ where: { slug: baseSlug } });
        
      const slug = existing ? existing.slug : await uniqueSlug(baseSlug);

      const productData = {
        name,
        slug,
        sku,
        price,
        comparePrice,
        specialPrice,
        stock,
        description,
        shortDescription,
        featured,
        specifications: specs,
        brandId,
        image: mainImage,
        images: JSON.stringify(galleryImages),
      };

      if (existing) {
        await prisma.product.update({
          where: { id: existing.id },
          data: {
            ...productData,
            categories: { set: categoryConnections }
          }
        });
      } else {
        await prisma.product.create({
          data: {
            ...productData,
            categories: { connect: categoryConnections }
          }
        });
      }

      imported++;
      // Live progress logging update
      await prisma.importLog.update({
        where: { id: logId },
        data: { imported, failed }
      });

    } catch (e: any) {
      failed++;
      errors.push(`Row error (Pass 1): ${e.message}`);
      await prisma.importLog.update({
        where: { id: logId },
        data: { imported, failed, errors: errors.join('\n') }
      });
    }
  }

  // PASS 2: Import Variation Rows
  const variantRows = rows.filter(row => row[parentSkuCol] || row[parentSlugCol]);

  for (const row of variantRows) {
    try {
      const parentSku = row[parentSkuCol]?.toString().trim();
      const parentSlug = row[parentSlugCol]?.toString().trim();

      // Find Parent Product
      let parent = null;
      if (parentSku) {
        parent = await prisma.product.findFirst({ where: { sku: parentSku } });
      }
      if (!parent && parentSlug) {
        parent = await prisma.product.findUnique({ where: { slug: parentSlug } });
      }

      if (!parent) {
        throw new Error(`Parent product not found for SKU: "${parentSku}" / Slug: "${parentSlug}"`);
      }

      // Upgrade Parent to Variable Product if simple
      if (parent.productType === 'SIMPLE') {
        await prisma.product.update({
          where: { id: parent.id },
          data: { productType: 'VARIABLE' }
        });
      }

      const rawPrice = parseFloat(row[priceCol]);
      const price = isNaN(rawPrice) ? parent.price : rawPrice;

      const rawSpecial = parseFloat(row[specialPriceCol]);
      const specialPrice = isNaN(rawSpecial) ? null : rawSpecial;

      const rawStock = parseInt(row[stockCol]);
      const stock = isNaN(rawStock) ? 0 : rawStock;

      const sku = row[skuCol]?.toString().trim() || null;

      const imgStrings = row[imgCol]?.toString().split(',') || [];
      const image = imgStrings[0]?.trim() || parent.image;

      // Upsert Product Variant
      const existingVariant = sku 
        ? await prisma.productVariant.findFirst({ where: { sku } })
        : null;

      const variantData = {
        productId: parent.id,
        sku,
        price,
        specialPrice,
        stock,
        image,
      };

      let variant;
      if (existingVariant) {
        variant = await prisma.productVariant.update({
          where: { id: existingVariant.id },
          data: variantData
        });
      } else {
        variant = await prisma.productVariant.create({
          data: variantData
        });
      }

      // Add Attributes
      // Format: "Color:Red,Size:M"
      const rawAttrs = row[varAttrCol]?.toString().split(',') || [];
      
      // Clean previous attributes
      await prisma.variantAttribute.deleteMany({
        where: { variantId: variant.id }
      });

      for (const attr of rawAttrs) {
        const idx = attr.indexOf(':');
        if (idx !== -1) {
          const name = attr.substring(0, idx).trim();
          const value = attr.substring(idx + 1).trim();
          if (name && value) {
            await prisma.variantAttribute.create({
              data: {
                variantId: variant.id,
                name,
                value
              }
            });
          }
        }
      }

      imported++;
      await prisma.importLog.update({
        where: { id: logId },
        data: { imported, failed }
      });

    } catch (e: any) {
      failed++;
      errors.push(`Row error (Pass 2): ${e.message}`);
      await prisma.importLog.update({
        where: { id: logId },
        data: { imported, failed, errors: errors.join('\n') }
      });
    }
  }

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
