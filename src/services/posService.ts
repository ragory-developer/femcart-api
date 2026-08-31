import prisma from '../config/database';
import { OrderStatus } from '@prisma/client';

export function sanitizePosProduct(product: any) {
  if (!product) return null;
  return {
    id: product.id,
    invi_pid: product.externalId || null,
    name: product.name,
    slug: product.slug,
    sku: product.sku || '',
    price: product.price,
    comparePrice: product.comparePrice || null,
    stock: product.stock,
    unit: product.unit || 'piece',
    brand: product.brand ? { id: product.brand.id, name: product.brand.name } : null,
    categories: (product.categories || []).map((c: any) => ({ id: c.id, name: c.name, slug: c.slug })),
    variants: (product.variants || []).map((v: any) => ({
      id: v.id,
      sku: v.sku || '',
      price: v.price,
      stock: v.stock,
      isDefault: v.isDefault
    })),
    createdAt: product.createdAt,
    updatedAt: product.updatedAt
  };
}

export function sanitizePosOrder(order: any) {
  if (!order) return null;
  return {
    id: order.id,
    orderNumber: order.id,
    status: order.status,
    paymentStatus: order.paymentStatus,
    paymentMethod: order.paymentMethod,
    totalAmount: order.total,
    customerName: order.customerName || order.user?.name || null,
    customerPhone: order.customerPhone || order.user?.phone || null,
    deliveryAddress: order.deliveryAddress,
    deliveryCity: order.deliveryCity || order.city?.name || null,
    trackingNumber: order.trackingNumber || null,
    courierName: order.courierName || null,
    items: (order.items || []).map((i: any) => ({
      id: i.id,
      productId: i.productId,
      variantId: i.variantId || null,
      sku: i.variant?.sku || i.product?.sku || '',
      name: i.variant
        ? `${i.product?.name || 'Product'} (${i.variant.sku || 'Variant'})`
        : (i.product?.name || 'Product'),
      quantity: i.quantity,
      unitPrice: i.price,
      total: i.price * i.quantity
    })),
    createdAt: order.createdAt,
    updatedAt: order.updatedAt
  };
}

export const posService = {
  // 1. Get Products Catalog
  async getProducts(params: { page?: number; limit?: number; search?: string; inStockOnly?: boolean }) {
    const page = Math.max(1, Number(params.page) || 1);
    const limit = Math.min(1000, Math.max(1, Number(params.limit) || 50));
    const skip = (page - 1) * limit;

    const where: any = {
      ...(params.search && {
        OR: [
          { name: { contains: params.search } },
          { sku: { contains: params.search } }
        ]
      }),
      ...(params.inStockOnly && { stock: { gt: 0 } })
    };

    const [products, total] = await Promise.all([
      prisma.product.findMany({
        where,
        skip,
        take: limit,
        orderBy: { updatedAt: 'desc' },
        include: { brand: true, categories: true, variants: true }
      }),
      prisma.product.count({ where })
    ]);

    return {
      data: products.map(sanitizePosProduct),
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) }
    };
  },

  // 2. Get Single Product by ID or SKU (Resolves Simple Products and Variants)
  async getProductByIdOrSku(idOrSku: string) {
    const trimmed = idOrSku.trim();

    // Check direct product match
    const product = await prisma.product.findFirst({
      where: {
        OR: [{ id: trimmed }, { sku: trimmed }]
      },
      include: { brand: true, categories: true, variants: true }
    });

    if (product) {
      return sanitizePosProduct(product);
    }

    // Check variant match
    const variant = await prisma.productVariant.findFirst({
      where: {
        OR: [{ id: trimmed }, { sku: trimmed }]
      },
      include: {
        product: {
          include: { brand: true, categories: true, variants: true }
        }
      }
    });

    if (variant && variant.product) {
      return sanitizePosProduct(variant.product);
    }

    return null;
  },

  // 3. Get Orders List
  async getOrders(params: { status?: string; page?: number; limit?: number }) {
    const page = Math.max(1, Number(params.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(params.limit) || 50));
    const skip = (page - 1) * limit;

    const where: any = {};
    if (params.status) {
      where.status = params.status.toUpperCase() as OrderStatus;
    }

    const [orders, total] = await Promise.all([
      prisma.order.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          items: {
            include: { product: true, variant: true }
          },
          user: true,
          city: true
        }
      }),
      prisma.order.count({ where })
    ]);

    return {
      data: orders.map(sanitizePosOrder),
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) }
    };
  },

  // 4. Get Single Order by ID
  async getOrderById(orderId: string) {
    const trimmed = orderId.trim();
    const order = await prisma.order.findFirst({
      where: {
        OR: [{ id: trimmed }, { externalId: trimmed }]
      },
      include: {
        items: {
          include: { product: true, variant: true }
        },
        user: true,
        city: true,
        orderNotes: true
      }
    });
    return sanitizePosOrder(order);
  },

  // 5. Update Order Status (Transactional with Inventory & Notes)
  async updateOrderStatus(
    orderId: string,
    payload: {
      status: any;
      paymentStatus?: string;
      trackingNumber?: string;
      courierName?: string;
      notes?: string;
      reason?: string;
    }
  ) {
    const trimmed = orderId.trim();
    const targetStatus = String(payload.status).toUpperCase() as OrderStatus;

    return await prisma.$transaction(async (tx: any) => {
      const order = await tx.order.findFirst({
        where: {
          OR: [{ id: trimmed }, { externalId: trimmed }]
        },
        include: {
          items: true
        }
      });

      if (!order) {
        throw new Error(`Order '${orderId}' not found.`);
      }

      const previousStatus = order.status;

      // Handle inventory restoration if moving to CANCELLED
      if (previousStatus !== 'CANCELLED' && targetStatus === 'CANCELLED') {
        for (const item of order.items) {
          if (item.variantId) {
            await tx.productVariant.update({
              where: { id: item.variantId },
              data: { stock: { increment: item.quantity } }
            });
            if (item.productId) {
              await tx.product.update({
                where: { id: item.productId },
                data: { stock: { increment: item.quantity } }
              });
            }
          } else if (item.productId) {
            await tx.product.update({
              where: { id: item.productId },
              data: { stock: { increment: item.quantity } }
            });
          }
        }
      } else if (previousStatus === 'CANCELLED' && targetStatus !== 'CANCELLED') {
        // Un-cancelling: decrement inventory back
        for (const item of order.items) {
          if (item.variantId) {
            await tx.productVariant.update({
              where: { id: item.variantId },
              data: { stock: { decrement: item.quantity } }
            });
            if (item.productId) {
              await tx.product.update({
                where: { id: item.productId },
                data: { stock: { decrement: item.quantity } }
              });
            }
          } else if (item.productId) {
            await tx.product.update({
              where: { id: item.productId },
              data: { stock: { decrement: item.quantity } }
            });
          }
        }
      }

      const updateData: any = {
        status: targetStatus,
        ...(payload.paymentStatus && { paymentStatus: payload.paymentStatus.toUpperCase() }),
        ...(payload.trackingNumber && { trackingNumber: payload.trackingNumber }),
        ...(payload.courierName && { courierName: payload.courierName }),
        ...(targetStatus === 'SHIPPED' && { shippedAt: new Date() })
      };

      const updated = await tx.order.update({
        where: { id: order.id },
        data: updateData,
        include: {
          items: {
            include: { product: true, variant: true }
          },
          user: true,
          city: true
        }
      });

      // Add audit note
      const noteContent = payload.reason || payload.notes || `Status updated to ${targetStatus} via Invi POS.`;
      await tx.orderNote.create({
        data: {
          orderId: order.id,
          content: noteContent,
          isSystem: true
        }
      });

      return {
        success: true,
        message: `Order status updated to ${targetStatus} successfully.`,
        data: sanitizePosOrder(updated)
      };
    });
  },

  // 6. Cancel Order
  async cancelOrder(orderId: string, reason: string) {
    return this.updateOrderStatus(orderId, {
      status: 'CANCELLED',
      reason: reason || 'Cancelled via Invi POS'
    });
  },

  // 7. Update Single Stock Balance (Handles Products & ProductVariants)
  async updateStock(idOrSku: string, newStock: number) {
    const trimmed = idOrSku.trim();
    const stockVal = Math.max(0, newStock);

    return await prisma.$transaction(async (tx: any) => {
      // 1. Check ProductVariant first
      const variant = await tx.productVariant.findFirst({
        where: { OR: [{ id: trimmed }, { sku: trimmed }] }
      });

      if (variant) {
        const prev = variant.stock;
        const updatedVariant = await tx.productVariant.update({
          where: { id: variant.id },
          data: { stock: stockVal }
        });

        // Recalculate parent product aggregate stock
        const allSiblings = await tx.productVariant.findMany({
          where: { productId: variant.productId },
          select: { stock: true }
        });
        const aggregateStock = allSiblings.reduce((sum: number, s: any) => sum + s.stock, 0);

        await tx.product.update({
          where: { id: variant.productId },
          data: { stock: aggregateStock }
        });

        return {
          message: 'Inventory updated successfully',
          results: {
            updated: 1,
            details: [
              {
                id: updatedVariant.id,
                sku: updatedVariant.sku || '',
                type: 'VARIANT',
                previousStock: prev,
                newStock: updatedVariant.stock,
                delta: updatedVariant.stock - prev
              }
            ]
          }
        };
      }

      // 2. Check Product
      const product = await tx.product.findFirst({
        where: { OR: [{ id: trimmed }, { sku: trimmed }] }
      });

      if (product) {
        const prev = product.stock;
        const updatedProduct = await tx.product.update({
          where: { id: product.id },
          data: { stock: stockVal }
        });

        return {
          message: 'Inventory updated successfully',
          results: {
            updated: 1,
            details: [
              {
                id: updatedProduct.id,
                sku: updatedProduct.sku || '',
                type: 'PRODUCT',
                previousStock: prev,
                newStock: updatedProduct.stock,
                delta: updatedProduct.stock - prev
              }
            ]
          }
        };
      }

      throw new Error(`Product or Variant '${idOrSku}' not found.`);
    });
  },

  // 8. Batch Stock Updates (Bulk Sync with Telemetry Logging)
  async batchUpdateStock(items: Array<{ sku: string; stock: number }>) {
    const startTime = Date.now();
    const results: any[] = [];

    for (const item of items) {
      if (!item.sku) continue;
      const stockVal = Math.max(0, parseInt(String(item.stock ?? 0), 10));

      try {
        const res = await this.updateStock(item.sku, stockVal);
        const detail = res.results.details[0];
        results.push({
          sku: item.sku,
          previousStock: detail.previousStock,
          newStock: detail.newStock,
          success: true
        });
      } catch (err: any) {
        results.push({ sku: item.sku, error: err.message, success: false });
      }
    }

    const durationMs = Date.now() - startTime;
    const updatedCount = results.filter(r => r.success).length;
    const isPartial = updatedCount > 0 && updatedCount < items.length;
    const syncStatus = updatedCount === items.length ? 'SUCCESS' : (isPartial ? 'PARTIAL' : 'FAILED');

    // Asynchronously log batch sync telemetry
    prisma.inviSyncLog.create({
      data: {
        type: 'INBOUND_STOCK',
        status: syncStatus,
        itemsCount: items.length,
        requestBody: { count: items.length, sample: items.slice(0, 5) },
        responseBody: { updatedCount, errors: results.filter(r => !r.success) },
        durationMs
      }
    }).catch(() => {});

    return {
      message: 'Absolute inventory sync complete',
      results: { updated: updatedCount, details: results }
    };
  },

  // 9. Brands and Categories Exports
  async exportAllBrands() {
    const brands = await prisma.brand.findMany({
      orderBy: { name: 'asc' },
      select: { id: true, name: true, slug: true, logo: true, createdAt: true, updatedAt: true }
    });
    return { data: brands };
  },

  async exportAllCategories() {
    const categories = await prisma.category.findMany({
      orderBy: { name: 'asc' },
      select: { id: true, name: true, slug: true, image: true, parentId: true, createdAt: true, updatedAt: true }
    });
    return { data: categories };
  },

  // 10. Outbound Events Polling Stream
  async getEvents(params: { since?: string; limit?: number }) {
    const limit = Math.min(100, Math.max(1, Number(params.limit) || 20));
    const sinceDate = params.since ? new Date(params.since) : new Date(Date.now() - 24 * 60 * 60 * 1000);

    const recentOrders = await prisma.order.findMany({
      where: {
        updatedAt: { gte: sinceDate }
      },
      take: limit,
      orderBy: { updatedAt: 'desc' },
      include: {
        items: {
          include: { product: true, variant: true }
        },
        user: true,
        city: true
      }
    });

    const events = recentOrders.map(order => ({
      eventId: `evt_ord_${order.id}_${order.updatedAt.getTime()}`,
      event: order.status === 'PENDING' ? 'order.created' : `order.status.${order.status.toLowerCase()}`,
      timestamp: order.updatedAt.toISOString(),
      data: sanitizePosOrder(order)
    }));

    return {
      events,
      count: events.length,
      since: sinceDate.toISOString(),
      message: 'Event stream operational'
    };
  }
};
