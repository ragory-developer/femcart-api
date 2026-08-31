import crypto from 'crypto';
import prisma from '../config/database';
import { CacheService } from '../core/redis/CacheService';
import logger from '../utils/logger';
import { getSetting, getSettingBool } from '../utils/settings';
import { OrderStatus, PaymentMethod } from '@prisma/client';

export interface InviWebhookPayload {
  event:
    | 'stock.changed'
    | 'inventory.updated'
    | 'product.stock_updated'
    | 'stock.batch_update'
    | 'inventory.bulk_sync'
    | 'order.status.changed'
    | 'order.status_updated'
    | 'order.shipped'
    | 'order.delivered'
    | 'order.cancelled'
    | 'order.returned'
    | 'order.created'
    | 'order.sell_created'
    | 'product.created'
    | 'product.updated'
    | 'product.price_changed'
    | 'product.deleted'
    | string;
  site_id?: number | string;
  timestamp?: number | string;
  data: Record<string, any>;
}

export class InviWebhookService {
  /**
   * Verify HMAC-SHA256 signature from x-invi-signature header
   */
  public static verifySignature(rawBody: string, signature: string, secret: string): boolean {
    if (!signature || !secret) return false;
    try {
      const hmac = crypto.createHmac('sha256', secret);
      const digest = hmac.update(rawBody).digest('hex');
      return crypto.timingSafeEqual(Buffer.from(digest), Buffer.from(signature));
    } catch {
      return false;
    }
  }

  /**
   * Map raw INVI status strings to Femcart OrderStatus enum
   */
  private static mapInviOrderStatus(rawStatus: string): OrderStatus | null {
    const s = String(rawStatus || '').toLowerCase().trim();
    if (['pending', 'unpaid', 'hold'].includes(s)) return 'PENDING';
    if (['confirmed', 'accepted'].includes(s)) return 'CONFIRMED';
    if (['processing', 'in_progress', 'packed'].includes(s)) return 'PROCESSING';
    if (['shipped', 'dispatched', 'in_transit', 'out_for_delivery'].includes(s)) return 'SHIPPED';
    if (['delivered', 'completed', 'success', 'paid'].includes(s)) return 'DELIVERED';
    if (['cancelled', 'canceled', 'void', 'failed'].includes(s)) return 'CANCELLED';
    if (['returned', 'return_received'].includes(s)) return 'RETURNED';

    const upper = s.toUpperCase() as OrderStatus;
    if (['PENDING', 'CONFIRMED', 'PROCESSING', 'SHIPPED', 'DELIVERED', 'CANCELLED', 'RETURNED'].includes(upper)) {
      return upper;
    }
    return null;
  }

  /**
   * Main Webhook Event Processor
   */
  public static async handleWebhookEvent(payload: InviWebhookPayload): Promise<{ success: boolean; message: string; data?: any }> {
    const isMasterEnabled = await getSettingBool('invi_master_enabled', true);
    if (!isMasterEnabled) {
      return { success: false, message: 'INVI POS Integration is globally disabled.' };
    }

    const isWebhookEnabled = await getSettingBool('invi_webhook_enabled', true);
    if (!isWebhookEnabled) {
      return { success: false, message: 'INVI Webhook Receiver is currently disabled in settings.' };
    }

    const { event, data } = payload;
    logger.info(`[InviWebhook] Received event '${event}'`, { event, dataKeys: Object.keys(data || {}) });

    if (!data) {
      return { success: false, message: 'Missing payload data' };
    }

    switch (event) {
      // ==========================================
      // 1. PRODUCT STOCK & INVENTORY CHANGES
      // ==========================================
      case 'stock.changed':
      case 'inventory.updated':
      case 'product.stock_updated': {
        return await this.handleStockChanged(data);
      }

      case 'stock.batch_update':
      case 'inventory.bulk_sync': {
        return await this.handleBatchStockSync(data);
      }

      // ==========================================
      // 2. ORDER STATUS CHANGES
      // ==========================================
      case 'order.status.changed':
      case 'order.status_updated':
      case 'order.shipped':
      case 'order.delivered': {
        return await this.handleOrderStatusChanged(data, event);
      }

      // ==========================================
      // 3. ORDER CANCELLED / RETURNED
      // ==========================================
      case 'order.cancelled': {
        return await this.handleOrderCancelled(data);
      }

      case 'order.returned': {
        return await this.handleOrderReturned(data);
      }

      // ==========================================
      // 4. INCOMING POS ORDER / SALE CREATED
      // ==========================================
      case 'order.created':
      case 'order.sell_created': {
        return await this.handlePosOrderCreated(data);
      }

      // ==========================================
      // 5. PRODUCT DATA / CATALOG CHANGES
      // ==========================================
      case 'product.created': {
        return await this.handleProductCreated(data);
      }

      case 'product.updated':
      case 'product.price_changed': {
        return await this.handleProductUpdated(data);
      }

      case 'product.deleted': {
        return await this.handleProductDeleted(data);
      }

      default: {
        logger.warn(`[InviWebhook] Unhandled event type '${event}'`, { payload });
        return { success: true, message: `Event '${event}' acknowledged (no action configured).` };
      }
    }
  }

  /**
   * 1. Single Product / Variant Stock Changed
   */
  private static async handleStockChanged(data: Record<string, any>) {
    const { ext_product_id, product_id, sku, invi_vid, new_stock, stock, delta, reason } = data;
    const targetStock = Number(new_stock !== undefined ? new_stock : stock);
    const identifier = sku || invi_vid || ext_product_id || product_id;

    if (isNaN(targetStock)) {
      return { success: false, message: 'Invalid target stock value provided.' };
    }

    let updatedItem: any = null;
    let diff = Number(delta) || 0;

    // Check ProductVariant first by SKU or inviId
    if (sku || invi_vid) {
      const variant = await prisma.productVariant.findFirst({
        where: {
          OR: [
            ...(sku ? [{ sku }] : []),
            ...(invi_vid ? [{ inviId: String(invi_vid) }] : [])
          ]
        },
        include: { product: true }
      });

      if (variant) {
        diff = diff || (targetStock - variant.stock);
        updatedItem = await prisma.productVariant.update({
          where: { id: variant.id },
          data: { stock: targetStock }
        });

        await prisma.inventoryLog.create({
          data: {
            productId: variant.productId,
            variantId: variant.id,
            sku: variant.sku || `VAR-${variant.id}`,
            previousStock: variant.stock,
            newStock: targetStock,
            delta: diff,
            source: 'INVI_WEBHOOK',
            reason: reason || 'Stock updated via INVI POS Webhook'
          }
        });
      }
    }

    // If not a variant, check main Product by SKU, ID, or inviId
    if (!updatedItem) {
      const product = await prisma.product.findFirst({
        where: {
          OR: [
            ...(sku ? [{ sku }] : []),
            ...(ext_product_id ? [{ id: String(ext_product_id) }] : []),
            ...(product_id ? [{ id: String(product_id) }, { inviId: String(product_id) }] : [])
          ]
        }
      });

      if (product) {
        diff = diff || (targetStock - product.stock);
        updatedItem = await prisma.product.update({
          where: { id: product.id },
          data: { stock: targetStock }
        });

        await prisma.inventoryLog.create({
          data: {
            productId: product.id,
            sku: product.sku || `PROD-${product.id}`,
            previousStock: product.stock,
            newStock: targetStock,
            delta: diff,
            source: 'INVI_WEBHOOK',
            reason: reason || 'Stock updated via INVI POS Webhook'
          }
        });
      }
    }

    if (updatedItem) {
      await CacheService.invalidateProducts();
      return {
        success: true,
        message: `Stock successfully updated to ${targetStock} for ${identifier}`,
        data: { id: updatedItem.id, stock: targetStock }
      };
    }

    return { success: false, message: `Product/Variant not found for identifier: ${identifier}` };
  }

  /**
   * 1.1 Bulk / Batch Stock Sync
   */
  private static async handleBatchStockSync(data: Record<string, any>) {
    const items = data.items || data.products || (Array.isArray(data) ? data : []);
    if (!Array.isArray(items) || items.length === 0) {
      return { success: false, message: 'No items provided in batch stock update.' };
    }

    let updatedCount = 0;
    for (const item of items) {
      const res = await this.handleStockChanged(item);
      if (res.success) updatedCount++;
    }

    await CacheService.invalidateProducts();
    return {
      success: true,
      message: `Batch stock sync completed: ${updatedCount}/${items.length} items updated.`,
      data: { updatedCount, total: items.length }
    };
  }

  /**
   * 2. Order Status Changed
   */
  private static async handleOrderStatusChanged(data: Record<string, any>, originalEvent?: string) {
    const {
      ext_order_id,
      order_id,
      invi_sell_id,
      status,
      payment_status,
      courier_name,
      tracking_id,
      tracking_number,
      tracking_url,
      notes
    } = data;

    const targetOrderId = ext_order_id || order_id || invi_sell_id;
    if (!targetOrderId) {
      return { success: false, message: 'Missing order identifier (ext_order_id or order_id).' };
    }

    const order = await prisma.order.findFirst({
      where: {
        OR: [
          { id: String(targetOrderId) },
          { externalId: String(targetOrderId) },
          { id: { endsWith: String(targetOrderId) } }
        ]
      }
    });

    if (!order) {
      return { success: false, message: `Order not found for identifier: ${targetOrderId}` };
    }

    const mappedStatus = status ? this.mapInviOrderStatus(status) : (originalEvent === 'order.shipped' ? 'SHIPPED' : originalEvent === 'order.delivered' ? 'DELIVERED' : null);
    const updateData: Record<string, any> = {};

    if (mappedStatus) {
      updateData.status = mappedStatus;
      if (mappedStatus === 'SHIPPED' && !order.shippedAt) {
        updateData.shippedAt = new Date();
      }
    }

    if (payment_status) {
      const p = String(payment_status).toUpperCase();
      if (['PAID', 'UNPAID', 'PARTIALLY_PAID', 'REFUNDED', 'FAILED'].includes(p)) {
        updateData.paymentStatus = p;
      }
    }

    const courier = courier_name || data.courier;
    const tracking = tracking_id || tracking_number || data.trackingNumber;
    const trackUrl = tracking_url || data.trackingUrl;

    if (courier) updateData.courierName = courier;
    if (tracking) updateData.trackingNumber = tracking;
    if (trackUrl) updateData.trackingUrl = trackUrl;

    const updatedOrder = await prisma.order.update({
      where: { id: order.id },
      data: updateData
    });

    // Create system order note
    const noteText = [
      `Status updated via INVI POS Webhook to [${updatedOrder.status}]`,
      invi_sell_id ? `Invi Sell #${invi_sell_id}` : null,
      courier ? `Courier: ${courier}` : null,
      tracking ? `Tracking: ${tracking}` : null,
      notes ? `Note: ${notes}` : null
    ].filter(Boolean).join(' | ');

    await prisma.orderNote.create({
      data: {
        orderId: order.id,
        content: noteText,
        isSystem: true
      }
    });

    return {
      success: true,
      message: `Order #${order.id} status updated to ${updatedOrder.status}`,
      data: { orderId: order.id, status: updatedOrder.status, paymentStatus: updatedOrder.paymentStatus }
    };
  }

  /**
   * 3. Order Cancelled
   */
  private static async handleOrderCancelled(data: Record<string, any>) {
    const { ext_order_id, order_id, reason, restore_stock = true } = data;
    const targetOrderId = ext_order_id || order_id;

    const order = await prisma.order.findFirst({
      where: {
        OR: [
          { id: String(targetOrderId) },
          { externalId: String(targetOrderId) },
          { id: { endsWith: String(targetOrderId) } }
        ]
      },
      include: { items: true }
    });

    if (!order) {
      return { success: false, message: `Order not found for cancellation: ${targetOrderId}` };
    }

    if (order.status === 'CANCELLED') {
      return { success: true, message: `Order #${order.id} is already cancelled.` };
    }

    await prisma.$transaction(async (tx) => {
      await tx.order.update({
        where: { id: order.id },
        data: { status: 'CANCELLED' }
      });

      if (restore_stock) {
        for (const item of order.items) {
          if (item.variantId) {
            await tx.productVariant.update({
              where: { id: item.variantId },
              data: { stock: { increment: item.quantity } }
            });
          } else if (item.productId) {
            await tx.product.update({
              where: { id: item.productId },
              data: { stock: { increment: item.quantity } }
            });
          }
        }
      }

      await tx.orderNote.create({
        data: {
          orderId: order.id,
          content: `Order cancelled via INVI POS Webhook. Reason: ${reason || 'Cancelled in POS'}. Inventory ${restore_stock ? 'restored' : 'retained'}.`,
          isSystem: true
        }
      });
    });

    await CacheService.invalidateProducts();
    return { success: true, message: `Order #${order.id} cancelled successfully.` };
  }

  /**
   * 3.1 Order Returned
   */
  private static async handleOrderReturned(data: Record<string, any>) {
    const { ext_order_id, order_id, reason, returned_items } = data;
    const targetOrderId = ext_order_id || order_id;

    const order = await prisma.order.findFirst({
      where: {
        OR: [
          { id: String(targetOrderId) },
          { externalId: String(targetOrderId) }
        ]
      },
      include: { items: true }
    });

    if (!order) {
      return { success: false, message: `Order not found: ${targetOrderId}` };
    }

    await prisma.$transaction(async (tx) => {
      await tx.order.update({
        where: { id: order.id },
        data: { status: 'RETURNED' }
      });

      // Handle item return triage if specific items passed
      if (Array.isArray(returned_items) && returned_items.length > 0) {
        for (const ret of returned_items) {
          const matchingItem = order.items.find((i) => i.productId === ret.productId || i.variantId === ret.variantId);
          if (matchingItem) {
            const qty = Number(ret.quantity) || matchingItem.quantity;
            await tx.orderItem.update({
              where: { id: matchingItem.id },
              data: { returnedQuantity: qty, returnReason: ret.reason || reason }
            });
          }
        }
      }

      await tx.orderNote.create({
        data: {
          orderId: order.id,
          content: `Order marked as RETURNED via INVI POS Webhook. Reason: ${reason || 'Returned to warehouse'}`,
          isSystem: true
        }
      });
    });

    return { success: true, message: `Order #${order.id} marked as RETURNED.` };
  }

  /**
   * 4. POS Inbound Order / Direct Sale Created
   */
  private static async handlePosOrderCreated(data: Record<string, any>) {
    const {
      invi_sell_id,
      sell_id,
      customer_name,
      customer_phone,
      total_amount,
      subtotal,
      items,
      payment_method,
      payment_status
    } = data;

    const externalId = String(invi_sell_id || sell_id || `INVI-POS-${Date.now()}`);

    // Check idempotency
    const existingOrder = await prisma.order.findUnique({ where: { externalId } });
    if (existingOrder) {
      return { success: true, message: `POS Order already recorded (ID: ${existingOrder.id})`, data: { orderId: existingOrder.id } };
    }

    // Default guest or pos user
    let user = await prisma.user.findFirst({ where: { role: 'ADMIN' } });
    if (!user) {
      user = await prisma.user.findFirst();
    }

    if (!user) {
      return { success: false, message: 'No user account found in database to attach POS order.' };
    }

    const orderTotal = Number(total_amount || subtotal || 0);
    const mappedPaymentMethod: PaymentMethod = (payment_method && ['BKASH', 'NAGAD', 'CARD', 'STRIPE', 'PAYPAL'].includes(String(payment_method).toUpperCase()))
      ? String(payment_method).toUpperCase() as PaymentMethod
      : 'COD';

    const newOrder = await prisma.$transaction(async (tx) => {
      const created = await tx.order.create({
        data: {
          userId: user.id,
          externalId,
          externalSource: 'INVI_POS_OFFLINE',
          customerName: customer_name || 'POS Walk-in Customer',
          customerPhone: customer_phone || 'N/A',
          deliveryAddress: 'INVI POS Physical Store Outlet',
          total: orderTotal,
          subtotal: Number(subtotal || orderTotal),
          status: 'DELIVERED',
          paymentStatus: payment_status ? String(payment_status).toUpperCase() : 'PAID',
          paymentMethod: mappedPaymentMethod,
        }
      });

      if (Array.isArray(items) && items.length > 0) {
        for (const it of items) {
          const qty = Number(it.quantity || it.qty || 1);
          const price = Number(it.unit_price || it.price || 0);

          let matchedProductId: string | null = null;
          let matchedVariantId: string | null = null;

          if (it.sku) {
            const variant = await tx.productVariant.findFirst({ where: { sku: it.sku } });
            if (variant) {
              matchedVariantId = variant.id;
              matchedProductId = variant.productId;
            } else {
              const prod = await tx.product.findFirst({ where: { sku: it.sku } });
              if (prod) matchedProductId = prod.id;
            }
          }

          await tx.orderItem.create({
            data: {
              orderId: created.id,
              productId: matchedProductId,
              variantId: matchedVariantId,
              quantity: qty,
              price: price,
            }
          });
        }
      }

      await tx.orderNote.create({
        data: {
          orderId: created.id,
          content: `POS Offline Sale recorded via INVI POS Webhook (Invi Sell #${externalId})`,
          isSystem: true
        }
      });

      return created;
    });

    return {
      success: true,
      message: `POS Order #${newOrder.id} successfully recorded`,
      data: { orderId: newOrder.id, externalId }
    };
  }

  /**
   * 5. Product Created in INVI POS -> Sync to Femcart Catalog
   */
  private static async handleProductCreated(data: Record<string, any>) {
    const {
      invi_id,
      name,
      sku,
      mrp,
      price,
      cost_price,
      stock,
      description,
      brand_name,
      category_name,
      images,
      image,
      is_active
    } = data;

    if (!name) {
      return { success: false, message: 'Product name is required.' };
    }

    const baseSlug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
    let slug = baseSlug;
    let counter = 1;
    while (await prisma.product.findUnique({ where: { slug } })) {
      slug = `${baseSlug}-${counter++}`;
    }

    const prodPrice = Number(mrp || price || 0);
    const prodStock = Number(stock || 0);

    // Resolve Brand
    let brandId: string | null = null;
    if (brand_name) {
      const brandSlug = String(brand_name).toLowerCase().replace(/[^a-z0-9]+/g, '-');
      let brand = await prisma.brand.findUnique({ where: { slug: brandSlug } });
      if (!brand) {
        brand = await prisma.brand.create({
          data: { name: brand_name, slug: brandSlug }
        });
      }
      brandId = brand.id;
    }

    // Resolve Category
    let categoryConnect: any = undefined;
    if (category_name) {
      const catSlug = String(category_name).toLowerCase().replace(/[^a-z0-9]+/g, '-');
      let cat = await prisma.category.findUnique({ where: { slug: catSlug } });
      if (!cat) {
        cat = await prisma.category.create({
          data: { name: category_name, slug: catSlug }
        });
      }
      categoryConnect = { connect: [{ id: cat.id }] };
    }

    const parsedImages = Array.isArray(images) ? JSON.stringify(images) : typeof images === 'string' ? images : image ? JSON.stringify([image]) : '[]';

    const newProduct = await prisma.product.create({
      data: {
        name,
        slug,
        sku: sku || undefined,
        inviId: invi_id ? String(invi_id) : undefined,
        price: prodPrice,
        stock: prodStock,
        description: description || '',
        images: parsedImages,
        image: image || (Array.isArray(images) && images[0]) || null,
        brandId,
        categories: categoryConnect
      }
    });

    await CacheService.invalidateProducts();
    return {
      success: true,
      message: `Product '${newProduct.name}' created in catalog (ID: ${newProduct.id})`,
      data: { id: newProduct.id, slug: newProduct.slug }
    };
  }

  /**
   * 5.1 Product / Variant Updated
   */
  private static async handleProductUpdated(data: Record<string, any>) {
    const {
      ext_product_id,
      product_id,
      invi_id,
      sku,
      name,
      mrp,
      price,
      compare_price,
      cost_price,
      stock,
      description,
      image,
      images,
      is_active
    } = data;

    const updateData: Record<string, any> = {};
    if (name) updateData.name = name;
    if (mrp !== undefined || price !== undefined) updateData.price = Number(mrp !== undefined ? mrp : price);
    if (compare_price !== undefined) updateData.comparePrice = Number(compare_price);
    if (stock !== undefined) updateData.stock = Number(stock);
    if (description !== undefined) updateData.description = description;
    if (image !== undefined) updateData.image = image;
    if (images !== undefined) {
      updateData.images = Array.isArray(images) ? JSON.stringify(images) : String(images);
    }

    let updated: any = null;

    // Check variant
    if (sku) {
      const variant = await prisma.productVariant.findFirst({ where: { sku } });
      if (variant) {
        const variantUpdate: Record<string, any> = {};
        if (price !== undefined || mrp !== undefined) variantUpdate.price = Number(mrp !== undefined ? mrp : price);
        if (stock !== undefined) variantUpdate.stock = Number(stock);
        if (image) variantUpdate.image = image;

        updated = await prisma.productVariant.update({
          where: { id: variant.id },
          data: variantUpdate
        });
      }
    }

    if (!updated) {
      const product = await prisma.product.findFirst({
        where: {
          OR: [
            ...(sku ? [{ sku }] : []),
            ...(ext_product_id ? [{ id: String(ext_product_id) }] : []),
            ...(product_id ? [{ id: String(product_id) }, { inviId: String(product_id) }] : []),
            ...(invi_id ? [{ inviId: String(invi_id) }] : [])
          ]
        }
      });

      if (product) {
        updated = await prisma.product.update({
          where: { id: product.id },
          data: updateData
        });
      }
    }

    if (updated) {
      await CacheService.invalidateProducts();
      return {
        success: true,
        message: `Product data updated successfully`,
        data: { id: updated.id }
      };
    }

    return { success: false, message: 'Product/Variant not found to update.' };
  }

  /**
   * 5.2 Product Deleted
   */
  private static async handleProductDeleted(data: Record<string, any>) {
    const { ext_product_id, product_id, sku, invi_id } = data;

    const product = await prisma.product.findFirst({
      where: {
        OR: [
          ...(sku ? [{ sku }] : []),
          ...(ext_product_id ? [{ id: String(ext_product_id) }] : []),
          ...(product_id ? [{ id: String(product_id) }, { inviId: String(product_id) }] : []),
          ...(invi_id ? [{ inviId: String(invi_id) }] : [])
        ]
      }
    });

    if (product) {
      await prisma.product.update({
        where: { id: product.id },
        data: { deletedAt: new Date() }
      });
      await CacheService.invalidateProducts();
      return { success: true, message: `Product #${product.id} marked as deleted.` };
    }

    return { success: false, message: 'Product not found for deletion.' };
  }
}
