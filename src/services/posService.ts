import crypto from 'crypto';
import { OrderStatus } from '@prisma/client';
import prisma from '../config/database';
import { CacheService } from '../core/redis/CacheService';
import { NotFoundError, BadRequestError } from '../utils/errors';
import { getSetting, getSettingBool } from '../utils/settings';

export interface DeltaInventoryItem {
  sku: string;
  delta: number; // e.g. -1 for sale, +5 for restock
  reason?: string;
  referenceId?: string;
}

export interface AbsoluteInventoryItem {
  sku: string;
  stock: number;
  reason?: string;
  referenceId?: string;
}

export interface UpdateOrderStatusPayload {
  status: OrderStatus;
  paymentStatus?: 'PAID' | 'UNPAID' | 'PARTIALLY_PAID' | 'REFUNDED' | 'FAILED';
  trackingNumber?: string;
  trackingUrl?: string | null;
  courierName?: string;
  posInvoiceNumber?: string;
  notes?: string;
}

/**
 * Sanitizes a product object for POS / Invi integration.
 * Strips internal bloat: seoData, faqs, specifications, upsell/downsell,
 * ratings, legacy WooCommerce placeholders, deletedAt/By, and raw IDs.
 */
export function sanitizePosProduct(product: any) {
  if (!product) return null;

  let images: string[] = [];
  if (Array.isArray(product.images)) {
    images = product.images;
  } else if (typeof product.images === 'string') {
    try {
      const parsed = JSON.parse(product.images);
      images = Array.isArray(parsed) ? parsed : [product.images];
    } catch {
      images = product.images ? [product.images] : [];
    }
  }

  let cleanBrand = null;
  if (product.brand) {
    cleanBrand = {
      id: product.brand.id,
      name: product.brand.name,
      slug: product.brand.slug,
      logo: product.brand.logo || null
    };
  }

  const cleanCategories = (product.categories || []).map((cat: any) => ({
    id: cat.id,
    name: cat.name,
    slug: cat.slug,
    image: cat.image || null,
    parentId: cat.parentId || null
  }));

  const cleanVariants = (product.variants || []).map((v: any) => ({
    id: v.id,
    invi_vid: v.externalId || v.inviId || null,
    sku: v.sku || '',
    price: v.price,
    comparePrice: v.comparePrice || null,
    specialPrice: v.specialPrice || null,
    stock: v.stock,
    image: v.image || null,
    weight: v.weight || null,
    attributes: (v.attributes || []).map((attr: any) => ({
      name: attr.name,
      value: attr.value
    }))
  }));

  return {
    id: product.id,
    invi_pid: product.externalId || product.inviId || null,
    name: product.name,
    slug: product.slug,
    sku: product.sku || '',
    price: product.price,
    comparePrice: product.comparePrice || null,
    specialPrice: product.specialPrice || null,
    stock: product.stock,
    unit: product.unit || 'piece',
    weight: product.weight || null,
    productType: product.productType || 'SIMPLE',
    featured: !!product.featured,
    image: product.image || (images.length > 0 ? images[0] : null),
    images,
    shortDescription: product.shortDescription || null,
    brand: cleanBrand,
    categories: cleanCategories,
    variants: cleanVariants,
    createdAt: product.createdAt,
    updatedAt: product.updatedAt
  };
}

/**
 * Sanitizes an order object for POS / Invi integration.
 * Strips internal tokens, foreign keys, and internal review/rating bloat.
 */
export function sanitizePosOrder(order: any) {
  if (!order) return null;

  const cleanItems = (order.items || []).map((item: any) => ({
    id: item.id,
    productId: item.productId || null,
    variantId: item.variantId || null,
    sku: item.variant?.sku || item.product?.sku || '',
    name: item.product?.name || 'Product',
    image: item.product?.image || null,
    unitPrice: item.price,
    quantity: item.quantity,
    total: item.price * item.quantity
  }));

  return {
    id: order.id,
    orderNumber: order.id.length <= 8 ? order.id.toUpperCase() : order.id.slice(-8).toUpperCase(),
    status: order.status,
    paymentStatus: order.paymentStatus || 'UNPAID',
    paymentMethod: order.paymentMethod || 'COD',
    totalAmount: order.total,
    subtotal: order.subtotal,
    deliveryFee: order.deliveryFee || 0,
    discountAmount: order.discount || 0,
    refundAmount: order.refundAmount || 0,
    customerName: order.customerName || order.user?.name || 'Customer',
    customerPhone: order.customerPhone || order.user?.phone || '',
    customerEmail: order.user?.email || null,
    deliveryAddress: order.deliveryAddress,
    deliveryCity: order.deliveryCity || null,
    deliveryArea: order.deliveryArea || null,
    deliverySlot: order.deliverySlot || null,
    courierName: order.courierName || null,
    trackingNumber: order.trackingNumber || null,
    trackingUrl: order.trackingUrl || null,
    customerNote: order.notes || null,
    shippedAt: order.shippedAt || null,
    createdAt: order.createdAt,
    updatedAt: order.updatedAt,
    items: cleanItems,
    orderNotes: (order.orderNotes || []).map((n: any) => ({
      id: n.id,
      content: n.content,
      isSystem: n.isSystem,
      createdAt: n.createdAt
    }))
  };
}

export class PosService {
  /**
   * Health check / Ping endpoint
   */
  public async ping(posConnection: { id: string; name: string; consumerKey: string; authMode?: string }) {
    return {
      status: 'healthy',
      message: 'Pong! POS connection is authenticated and operational.',
      serverTime: new Date().toISOString(),
      platform: 'Invi & Femcart Integration Engine v1.0',
      connection: {
        id: posConnection.id,
        name: posConnection.name,
        authMode: posConnection.authMode || 'DUAL_KEY',
        consumerKey: posConnection.consumerKey
      }
    };
  }

  /**
   * Retrieves paginated products with full relational trees and search/filter support
   */
  public async getProducts(
    page: number = 1,
    limit: number = 50,
    filters: { search?: string; categoryId?: string; brandId?: string; inStockOnly?: boolean } = {}
  ) {
    const skip = (page - 1) * limit;
    const where: any = { deletedAt: null };

    if (filters.search) {
      const q = filters.search.trim();
      where.OR = [
        { name: { contains: q, mode: 'insensitive' } },
        { sku: { contains: q, mode: 'insensitive' } },
        { slug: { contains: q, mode: 'insensitive' } },
        { variants: { some: { sku: { contains: q, mode: 'insensitive' } } } }
      ];
    }

    if (filters.categoryId) {
      where.categories = { some: { id: filters.categoryId } };
    }

    if (filters.brandId) {
      where.brandId = filters.brandId;
    }

    if (filters.inStockOnly) {
      where.OR = [
        { stock: { gt: 0 } },
        { variants: { some: { stock: { gt: 0 } } } }
      ];
    }

    const [products, total] = await Promise.all([
      prisma.product.findMany({
        where,
        skip,
        take: limit,
        include: {
          brand: true,
          categories: true,
          variants: {
            include: {
              attributes: true
            }
          }
        },
        orderBy: { updatedAt: 'desc' }
      }),
      prisma.product.count({ where })
    ]);

    const cleanProducts = products.map((product: any) => sanitizePosProduct(product));

    return {
      data: cleanProducts,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit)
      }
    };
  }

  /**
   * Fast lookup of product by ID, SKU, or Slug (e.g. for POS barcode scanning)
   */
  public async getProductByIdOrSku(identifier: string) {
    const product = await prisma.product.findFirst({
      where: {
        OR: [
          { id: identifier },
          { sku: identifier },
          { slug: identifier },
          { variants: { some: { sku: identifier } } }
        ],
        deletedAt: null
      },
      include: {
        brand: { select: { id: true, name: true, slug: true, logo: true } },
        categories: { select: { id: true, name: true, slug: true } },
        variants: {
          include: {
            attributes: true
          }
        }
      }
    });

    if (!product) {
      throw new NotFoundError(`Product not found for identifier: "${identifier}"`);
    }

    return { data: sanitizePosProduct(product) };
  }

  /**
   * Retrieves paginated orders with items, user details, and filtering
   */
  public async getOrders(
    page: number = 1,
    limit: number = 50,
    filters: {
      status?: OrderStatus;
      paymentStatus?: string;
      search?: string;
      dateFrom?: string;
      dateTo?: string;
    } = {}
  ) {
    const skip = (page - 1) * limit;
    const where: any = { deletedAt: null };

    if (filters.status) {
      where.status = filters.status;
    }

    if (filters.paymentStatus) {
      where.paymentStatus = filters.paymentStatus;
    }

    if (filters.search) {
      const q = filters.search.trim();
      where.OR = [
        { id: { contains: q, mode: 'insensitive' } },
        { customerName: { contains: q, mode: 'insensitive' } },
        { customerPhone: { contains: q, mode: 'insensitive' } },
        { trackingNumber: { contains: q, mode: 'insensitive' } },
        { user: { name: { contains: q, mode: 'insensitive' } } },
        { user: { phone: { contains: q, mode: 'insensitive' } } }
      ];
    }

    if (filters.dateFrom || filters.dateTo) {
      where.createdAt = {};
      if (filters.dateFrom) {
        const fromDate = new Date(filters.dateFrom);
        if (!isNaN(fromDate.getTime())) where.createdAt.gte = fromDate;
      }
      if (filters.dateTo) {
        const toDate = new Date(filters.dateTo);
        if (!isNaN(toDate.getTime())) where.createdAt.lte = toDate;
      }
    }

    const [orders, total] = await Promise.all([
      prisma.order.findMany({
        where,
        skip,
        take: limit,
        include: {
          items: {
            include: {
              product: { select: { id: true, sku: true, name: true, image: true, price: true } },
              variant: { select: { id: true, sku: true, price: true } }
            }
          },
          user: { select: { id: true, name: true, email: true, phone: true } },
          orderNotes: { select: { id: true, content: true, createdAt: true, isSystem: true } }
        },
        orderBy: { createdAt: 'desc' }
      }),
      prisma.order.count({ where })
    ]);

    const cleanOrders = orders.map(order => sanitizePosOrder(order));

    return {
      data: cleanOrders,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit)
      }
    };
  }

  /**
   * Retrieves single order by ID or tracking number
   */
  public async getOrderById(id: string) {
    const order = await prisma.order.findFirst({
      where: {
        OR: [
          { id },
          { trackingNumber: id }
        ],
        deletedAt: null
      },
      include: {
        items: {
          include: {
            product: { select: { id: true, sku: true, name: true, image: true, price: true } },
            variant: { select: { id: true, sku: true, price: true } }
          }
        },
        user: { select: { id: true, name: true, email: true, phone: true } },
        orderNotes: { select: { id: true, content: true, createdAt: true, isSystem: true } }
      }
    });

    if (!order) {
      throw new NotFoundError(`Order not found for ID or Tracking Number: "${id}"`);
    }

    return { data: sanitizePosOrder(order) };
  }

  /**
   * Updates order status from POS with automated audit notes, inventory restock on cancellation, and webhook dispatch
   */
  public async updateOrderStatus(
    orderId: string,
    payload: UpdateOrderStatusPayload,
    posName: string = 'POS System'
  ) {
    const currentOrder = await prisma.order.findFirst({
      where: {
        OR: [
          { id: orderId },
          { trackingNumber: orderId },
          { externalId: orderId },
          { paymentId: orderId }
        ],
        deletedAt: null
      },
      include: {
        items: {
          include: {
            product: { select: { id: true, sku: true } },
            variant: { select: { id: true, sku: true } }
          }
        },
        user: true
      }
    });

    if (!currentOrder) {
      throw new NotFoundError(`Order not found with identifier: "${orderId}"`);
    }

    const targetOrderId = currentOrder.id;
    const { status, paymentStatus, trackingNumber, trackingUrl, courierName, posInvoiceNumber, notes } = payload;

    const updatedOrder = await prisma.$transaction(async (tx) => {
      const updateData: any = { status };

      if (paymentStatus) {
        updateData.paymentStatus = paymentStatus;
      } else if (status === 'COMPLETED' || status === 'DELIVERED') {
        updateData.paymentStatus = 'PAID';
      }

      if (trackingNumber !== undefined) updateData.trackingNumber = trackingNumber;
      if (trackingUrl !== undefined) updateData.trackingUrl = trackingUrl;
      if (courierName !== undefined) updateData.courierName = courierName;
      if (status === 'SHIPPED' && currentOrder.status !== 'SHIPPED') {
        updateData.shippedAt = new Date();
      }

      const savedOrder = await tx.order.update({
        where: { id: targetOrderId },
        data: updateData,
        include: {
          items: {
            include: {
              product: { select: { id: true, sku: true, name: true, image: true } },
              variant: { select: { id: true, sku: true } }
            }
          },
          user: { select: { id: true, name: true, phone: true, email: true } }
        }
      });

      // 1. Audit Note Logging
      let noteText = `Order status changed from ${currentOrder.status} to ${status} via POS integration (${posName}).`;
      if (posInvoiceNumber) noteText += ` POS Invoice: ${posInvoiceNumber}.`;
      if (notes) noteText += ` Notes: ${notes}.`;

      await tx.orderNote.create({
        data: {
          orderId: targetOrderId,
          content: noteText,
          isSystem: true
        }
      });

      // 2. Automated Inventory Restock if order is CANCELLED
      if (currentOrder.status !== 'CANCELLED' && status === 'CANCELLED') {
        for (const item of currentOrder.items) {
          if (item.variantId) {
            await tx.productVariant.update({
              where: { id: item.variantId },
              data: { stock: { increment: item.quantity } }
            });
            if (item.productId) {
              await tx.inventoryLog.create({
                data: {
                  productId: item.productId,
                  variantId: item.variantId,
                  sku: item.variant?.sku || `VAR-${item.variantId}`,
                  previousStock: 0,
                  newStock: item.quantity,
                  delta: item.quantity,
                  source: 'POS_ORDER_CANCELLED',
                  referenceId: orderId,
                  reason: `Restocked ${item.quantity} units due to order cancellation via ${posName}`
                }
              });
            }
          } else if (item.productId) {
            await tx.product.update({
              where: { id: item.productId },
              data: { stock: { increment: item.quantity } }
            });
            await tx.inventoryLog.create({
              data: {
                productId: item.productId,
                sku: item.product?.sku || `PROD-${item.productId}`,
                previousStock: 0,
                newStock: item.quantity,
                delta: item.quantity,
                source: 'POS_ORDER_CANCELLED',
                referenceId: orderId,
                reason: `Restocked ${item.quantity} units due to order cancellation via ${posName}`
              }
            });
          }
        }
      }

      // 3. Reward Points Allocation on completion
      const isOldRewardable = currentOrder.status === 'COMPLETED';
      const isNewRewardable = status === 'COMPLETED';
      if (!isOldRewardable && isNewRewardable && currentOrder.rewardPoints > 0 && !currentOrder.user?.isGuest) {
        await tx.user.update({
          where: { id: currentOrder.userId },
          data: { rewardPoints: { increment: currentOrder.rewardPoints } }
        });
      }

      return savedOrder;
    });

    await CacheService.invalidateProducts();

    // Dispatch Outbound POS Event for other listeners
    PosService.emitEvent('ORDER_STATUS_UPDATED', {
      orderId: updatedOrder.id,
      previousStatus: currentOrder.status,
      newStatus: status,
      paymentStatus: updatedOrder.paymentStatus,
      trackingNumber: updatedOrder.trackingNumber,
      updatedAt: updatedOrder.updatedAt
    }).catch(() => {});

    return {
      success: true,
      message: `Order status updated to ${status} successfully.`,
      data: sanitizePosOrder(updatedOrder)
    };
  }

  /**
   * Cancels an order from POS with automated inventory restock and audit logging
   */
  public async cancelOrder(
    orderId: string,
    payload: { reason?: string } = {},
    posName: string = 'POS System'
  ) {
    return this.updateOrderStatus(
      orderId,
      {
        status: OrderStatus.CANCELLED,
        notes: payload.reason || `Order cancelled via ${posName}`
      },
      posName
    );
  }

  /**
   * Batch update multiple order statuses from POS
   */
  public async batchUpdateOrderStatus(
    orders: Array<{ id: string } & UpdateOrderStatusPayload>,
    posName: string = 'POS System'
  ) {
    const results: Array<{ id: string; status: 'SUCCESS' | 'FAILED'; message?: string }> = [];

    for (const ord of orders) {
      try {
        await this.updateOrderStatus(ord.id, ord, posName);
        results.push({ id: ord.id, status: 'SUCCESS' });
      } catch (err: any) {
        results.push({ id: ord.id, status: 'FAILED', message: err.message });
      }
    }

    return {
      success: true,
      total: orders.length,
      successCount: results.filter(r => r.status === 'SUCCESS').length,
      failedCount: results.filter(r => r.status === 'FAILED').length,
      results
    };
  }

  /**
   * Retrieves brands (paginated or all)
   */
  public async getBrands(page: number = 1, limit: number = 50, search?: string, all?: boolean) {
    const where: any = { deletedAt: null };

    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { slug: { contains: search, mode: 'insensitive' } }
      ];
    }

    if (all) {
      const brands = await prisma.brand.findMany({
        where,
        include: {
          _count: {
            select: { products: true }
          }
        },
        orderBy: { name: 'asc' }
      });

      const cleanBrands = brands.map((b: any) => ({
        id: b.id,
        name: b.name,
        slug: b.slug,
        logo: b.logo,
        productCount: b._count?.products || 0,
        createdAt: b.createdAt,
        updatedAt: b.updatedAt
      }));

      return {
        data: cleanBrands,
        total: cleanBrands.length
      };
    }

    const skip = (page - 1) * limit;
    const [brands, total] = await Promise.all([
      prisma.brand.findMany({
        where,
        skip,
        take: limit,
        include: {
          _count: {
            select: { products: true }
          }
        },
        orderBy: { updatedAt: 'desc' }
      }),
      prisma.brand.count({ where })
    ]);

    const cleanBrands = brands.map((b: any) => ({
      id: b.id,
      name: b.name,
      slug: b.slug,
      logo: b.logo,
      productCount: b._count?.products || 0,
      createdAt: b.createdAt,
      updatedAt: b.updatedAt
    }));

    return {
      data: cleanBrands,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit)
      }
    };
  }

  /**
   * Get single brand details
   */
  public async getBrandById(identifier: string) {
    const brand = await prisma.brand.findFirst({
      where: {
        OR: [{ id: identifier }, { slug: identifier }],
        deletedAt: null
      },
      include: {
        _count: { select: { products: true } },
        products: {
          where: { deletedAt: null },
          take: 20,
          select: { id: true, name: true, sku: true, price: true, stock: true, image: true }
        }
      }
    });

    if (!brand) {
      throw new NotFoundError(`Brand not found for: "${identifier}"`);
    }

    const { deletedAt, deletedBy, content, seoData, ...rest } = brand;
    return { data: rest };
  }

  /**
   * Retrieves categories (paginated or all)
   */
  public async getCategories(page: number = 1, limit: number = 50, search?: string, all?: boolean) {
    const where: any = { deletedAt: null };

    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { slug: { contains: search, mode: 'insensitive' } }
      ];
    }

    if (all) {
      const categories = await prisma.category.findMany({
        where,
        include: {
          parent: { select: { id: true, name: true, slug: true } },
          children: { select: { id: true, name: true, slug: true, image: true } },
          _count: { select: { products: true } }
        },
        orderBy: { name: 'asc' }
      });

      const cleanCategories = categories.map((cat: any) => ({
        id: cat.id,
        name: cat.name,
        slug: cat.slug,
        image: cat.image,
        parentId: cat.parentId,
        parent: cat.parent,
        children: cat.children || [],
        productCount: cat._count?.products || 0,
        createdAt: cat.createdAt,
        updatedAt: cat.updatedAt
      }));

      return {
        data: cleanCategories,
        total: cleanCategories.length
      };
    }

    const skip = (page - 1) * limit;
    const [categories, total] = await Promise.all([
      prisma.category.findMany({
        where,
        skip,
        take: limit,
        include: {
          parent: { select: { id: true, name: true, slug: true } },
          children: { select: { id: true, name: true, slug: true, image: true } },
          _count: { select: { products: true } }
        },
        orderBy: { updatedAt: 'desc' }
      }),
      prisma.category.count({ where })
    ]);

    const cleanCategories = categories.map((cat: any) => ({
      id: cat.id,
      name: cat.name,
      slug: cat.slug,
      image: cat.image,
      parentId: cat.parentId,
      parent: cat.parent,
      children: cat.children || [],
      productCount: cat._count?.products || 0,
      createdAt: cat.createdAt,
      updatedAt: cat.updatedAt
    }));

    return {
      data: cleanCategories,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit)
      }
    };
  }

  /**
   * Get single category details
   */
  public async getCategoryById(identifier: string) {
    const category = await prisma.category.findFirst({
      where: {
        OR: [{ id: identifier }, { slug: identifier }],
        deletedAt: null
      },
      include: {
        parent: { select: { id: true, name: true, slug: true } },
        children: { select: { id: true, name: true, slug: true, image: true } },
        _count: { select: { products: true } }
      }
    });

    if (!category) {
      throw new NotFoundError(`Category not found for: "${identifier}"`);
    }

    const { deletedAt, deletedBy, content, seoData, ...rest } = category;
    return { data: rest };
  }

  /**
   * TWO-WAY REAL-TIME DELTA SYNC (POS -> Web)
   */
  public async syncDeltaInventory(
    items: DeltaInventoryItem[],
    posName: string = 'POS'
  ) {
    const updatedDetails: Array<{
      sku: string;
      previousStock: number;
      newStock: number;
      delta: number;
      status: 'UPDATED' | 'NOT_FOUND' | 'ERROR';
    }> = [];

    let updatedCount = 0;
    let notFoundCount = 0;

    await prisma.$transaction(async (tx) => {
      for (const item of items) {
        if (!item.sku) continue;

        // 1. Check Product Variant first
        const variant = await tx.productVariant.findFirst({
          where: { sku: item.sku }
        });

        if (variant) {
          const previousStock = variant.stock;
          const newStock = Math.max(0, previousStock + item.delta);

          await tx.productVariant.update({
            where: { id: variant.id },
            data: { stock: newStock }
          });

          await tx.inventoryLog.create({
            data: {
              productId: variant.productId,
              variantId: variant.id,
              sku: item.sku,
              previousStock,
              newStock,
              delta: item.delta,
              source: 'POS_DELTA',
              referenceId: item.referenceId ? String(item.referenceId) : `POS-DELTA-${Date.now()}`,
              reason: item.reason || `Delta stock adjustment from ${posName}`
            }
          });

          updatedDetails.push({
            sku: item.sku,
            previousStock,
            newStock,
            delta: item.delta,
            status: 'UPDATED'
          });
          updatedCount++;
          continue;
        }

        // 2. Check Parent Product
        const product = await tx.product.findFirst({
          where: { sku: item.sku }
        });

        if (product) {
          const previousStock = product.stock;
          const newStock = Math.max(0, previousStock + item.delta);

          await tx.product.update({
            where: { id: product.id },
            data: { stock: newStock }
          });

          await tx.inventoryLog.create({
            data: {
              productId: product.id,
              sku: item.sku,
              previousStock,
              newStock,
              delta: item.delta,
              source: 'POS_DELTA',
              referenceId: item.referenceId ? String(item.referenceId) : `POS-DELTA-${Date.now()}`,
              reason: item.reason || `Delta stock adjustment from ${posName}`
            }
          });

          updatedDetails.push({
            sku: item.sku,
            previousStock,
            newStock,
            delta: item.delta,
            status: 'UPDATED'
          });
          updatedCount++;
          continue;
        }

        // Not found
        notFoundCount++;
        updatedDetails.push({
          sku: item.sku,
          previousStock: 0,
          newStock: 0,
          delta: item.delta,
          status: 'NOT_FOUND'
        });
      }
    });

    await CacheService.invalidateProducts();

    return {
      message: 'Delta inventory sync processed successfully',
      results: {
        totalProcessed: items.length,
        updated: updatedCount,
        notFound: notFoundCount,
        details: updatedDetails
      }
    };
  }

  /**
   * ABSOLUTE INVENTORY SYNC (POS -> Web)
   */
  public async syncInventory(
    items: AbsoluteInventoryItem[],
    posName: string = 'POS'
  ) {
    const updatedDetails: Array<{
      sku: string;
      previousStock: number;
      newStock: number;
      delta: number;
      status: 'UPDATED' | 'NOT_FOUND';
    }> = [];

    let updatedCount = 0;
    let notFoundCount = 0;

    await prisma.$transaction(async (tx) => {
      for (const rawItem of items) {
        const item: any = rawItem;
        const identifier = item.sku || item.id || item.productId || item.pid || item.inviId;
        const stockVal = item.stock ?? item.quantity ?? item.new_stock ?? item.qty;
        if (identifier === undefined || stockVal === undefined) continue;

        const newStock = Math.max(0, parseInt(String(stockVal), 10) || 0);
        const idStr = String(identifier);

        // Check variant
        const variant = await tx.productVariant.findFirst({
          where: {
            OR: [
              { sku: idStr },
              { id: idStr },
              { externalId: idStr }
            ]
          }
        });

        if (variant) {
          const previousStock = variant.stock;
          const delta = newStock - previousStock;

          await tx.productVariant.update({
            where: { id: variant.id },
            data: { stock: newStock }
          });

          await tx.inventoryLog.create({
            data: {
              productId: variant.productId,
              variantId: variant.id,
              sku: variant.sku || idStr,
              previousStock,
              newStock,
              delta,
              source: 'POS_ABSOLUTE',
              referenceId: item.referenceId ? String(item.referenceId) : `POS-ABS-${Date.now()}`,
              reason: item.reason || `Absolute stock sync from ${posName}`
            }
          });

          updatedDetails.push({
            sku: variant.sku || idStr,
            previousStock,
            newStock,
            delta,
            status: 'UPDATED'
          });
          updatedCount++;
          continue;
        }

        // Check product
        const product = await tx.product.findFirst({
          where: {
            OR: [
              { sku: idStr },
              { id: idStr },
              { externalId: idStr }
            ],
            deletedAt: null
          }
        });

        if (product) {
          const previousStock = product.stock;
          const delta = newStock - previousStock;

          await tx.product.update({
            where: { id: product.id },
            data: { stock: newStock }
          });

          await tx.inventoryLog.create({
            data: {
              productId: product.id,
              sku: product.sku || idStr,
              previousStock,
              newStock,
              delta,
              source: 'POS_ABSOLUTE',
              referenceId: item.referenceId ? String(item.referenceId) : `POS-ABS-${Date.now()}`,
              reason: item.reason || `Absolute stock sync from ${posName}`
            }
          });

          updatedDetails.push({
            sku: product.sku || idStr,
            previousStock,
            newStock,
            delta,
            status: 'UPDATED'
          });
          updatedCount++;
          continue;
        }

        notFoundCount++;
        updatedDetails.push({
          sku: idStr,
          previousStock: 0,
          newStock,
          delta: 0,
          status: 'NOT_FOUND'
        });
      }
    });

    await CacheService.invalidateProducts();

    return {
      message: 'Absolute inventory sync complete',
      results: {
        totalProcessed: items.length,
        updated: updatedCount,
        notFound: notFoundCount,
        details: updatedDetails
      }
    };
  }

  /**
   * Query batch stock levels for multiple SKUs or Product IDs
   */
  public async queryBatchStock(skus: string[] = [], pids: string[] = []) {
    const results: Array<{ id?: string; sku?: string; name?: string; stock: number; price?: number }> = [];

    if (skus.length > 0) {
      const variants = await prisma.productVariant.findMany({
        where: { sku: { in: skus } },
        include: { product: { select: { name: true, price: true } } }
      });
      for (const v of variants) {
        if (v.sku) {
          results.push({
            id: v.id,
            sku: v.sku,
            name: v.product?.name,
            stock: v.stock,
            price: v.price
          });
        }
      }

      const foundSkus = new Set(variants.map(v => v.sku));
      const remainingSkus = skus.filter(s => !foundSkus.has(s));

      if (remainingSkus.length > 0) {
        const products = await prisma.product.findMany({
          where: { sku: { in: remainingSkus }, deletedAt: null }
        });
        for (const p of products) {
          results.push({
            id: p.id,
            sku: p.sku || '',
            name: p.name,
            stock: p.stock,
            price: p.price
          });
        }
      }
    }

    if (pids.length > 0) {
      const pidStrings = pids.map(p => String(p));
      const products = await prisma.product.findMany({
        where: {
          OR: [
            { id: { in: pidStrings } },
            { externalId: { in: pidStrings } }
          ],
          deletedAt: null
        }
      });
      for (const p of products) {
        results.push({
          id: p.id,
          sku: p.sku || '',
          name: p.name,
          stock: p.stock,
          price: p.price
        });
      }
    }

    return {
      success: true,
      items: results
    };
  }

  /**
   * UPDATE INVENTORY BY ID (Direct PUT)
   */
  public async updateInventoryById(id: string, newStock: number, posName: string = 'POS') {
    let updatedCount = 0;
    const updatedDetails: any[] = [];
    
    await prisma.$transaction(async (tx) => {
      const variant = await tx.productVariant.findFirst({
        where: {
          OR: [{ id: id }, { externalId: id }, { sku: id }]
        }
      });

      if (variant) {
        const previousStock = variant.stock;
        const delta = newStock - previousStock;
        await tx.productVariant.update({
          where: { id: variant.id },
          data: { stock: newStock }
        });
        
        await tx.inventoryLog.create({
          data: {
            productId: variant.productId,
            variantId: variant.id,
            sku: variant.sku || '',
            previousStock,
            newStock,
            delta,
            source: 'POS_ABSOLUTE',
            reason: `Direct stock update from ${posName}`
          }
        });

        // Recompute parent product aggregate stock
        const siblingVariants = await tx.productVariant.findMany({
          where: { productId: variant.productId },
          select: { stock: true }
        });
        const aggregateStock = siblingVariants.reduce((sum, v) => sum + (v.stock || 0), 0);
        await tx.product.update({
          where: { id: variant.productId },
          data: { stock: aggregateStock }
        });

        updatedCount++;
        updatedDetails.push({ id: variant.id, previousStock, newStock, delta, type: 'VARIANT' });
        return;
      }

      const product = await tx.product.findFirst({
        where: {
          OR: [{ id: id }, { externalId: id }, { sku: id }],
          deletedAt: null
        }
      });

      if (product) {
        const previousStock = product.stock;
        const delta = newStock - previousStock;
        await tx.product.update({
          where: { id: product.id },
          data: { stock: newStock }
        });
        
        await tx.inventoryLog.create({
          data: {
            productId: product.id,
            sku: product.sku || '',
            previousStock,
            newStock,
            delta,
            source: 'POS_ABSOLUTE',
            reason: `Direct stock update from ${posName}`
          }
        });
        updatedCount++;
        updatedDetails.push({ id: product.id, previousStock, newStock, delta, type: 'PRODUCT' });
        return;
      }
      
      throw new NotFoundError(`Product or Variant not found for identifier: ${id}`);
    });

    await CacheService.invalidateProducts();
    
    return {
      message: 'Inventory updated successfully',
      results: { updated: updatedCount, details: updatedDetails }
    };
  }

  /**
   * TWO-WAY OUTBOUND POLLING (Web -> POS)
   */
  public async getEvents(since?: string, limit: number = 100) {
    const whereClause: any = {};

    if (since) {
      const parsedDate = new Date(since);
      if (!isNaN(parsedDate.getTime())) {
        whereClause.createdAt = { gt: parsedDate };
      }
    }

    const events = await prisma.posEvent.findMany({
      where: whereClause,
      take: limit,
      orderBy: { createdAt: 'asc' }
    });

    return {
      data: events,
      count: events.length,
      serverTime: new Date().toISOString()
    };
  }

  /**
   * Dispatches outbound event
   */
  public static async emitEvent(eventType: string, payload: any) {
    try {
      const event = await prisma.posEvent.create({
        data: {
          eventType,
          payload
        }
      });

      const activeConnections = await prisma.apiKey.findMany({
        where: {
          status: 'ACTIVE',
          webhookUrl: { not: null }
        }
      });

      for (const conn of activeConnections) {
        if (!conn.webhookUrl) continue;
        
        PosService.sendWebhook(conn.webhookUrl, conn.webhookSecret, {
          id: event.id,
          eventType,
          data: payload,
          timestamp: event.createdAt.toISOString()
        }).catch((err) => {
          console.error(`Failed to push POS webhook to ${conn.webhookUrl}:`, err.message);
        });
      }

      // PUSH EVENT TO REMOTE INVI POS (Unified Outbound Webhook)
      const isMaster = await getSettingBool('invi_master_enabled', true);
      const isAutoPush = await getSettingBool('invi_auto_push_orders', true);
      const outboundUrl = await getSetting('invi_outbound_api_url', process.env.INVI_API_URL || '');
      const outboundToken = await getSetting('invi_outbound_token', process.env.INVI_ACCESS_TOKEN || '');

      if (isMaster && outboundUrl) {
        // Skip order pushing if auto-push is disabled
        const shouldSkip = eventType === 'order.created' && !isAutoPush;
        
        if (!shouldSkip) {
          const webhookPayload = {
            event: eventType,
            timestamp: new Date().toISOString(),
            data: payload
          };

          PosService.pushEventToRemoteInvi(outboundUrl, outboundToken, webhookPayload).catch((err) => {
            console.error(`[InviOutbound] Failed to push event ${eventType}:`, err.message);
          });
        }
      }

      return event;
    } catch (err: any) {
      console.error('Failed to emit POS event:', err.message);
    }
  }

  /**
   * Helper: Dispatches generic event payload to Remote INVI POS webhook server
   */
  private static async pushEventToRemoteInvi(url: string, token: string | null, webhookPayload: any) {
    const rawBody = JSON.stringify(webhookPayload);
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'User-Agent': 'Femcart-Ecom-Outbound-Webhook/1.0'
    };
    
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
      headers['X-API-Key'] = token;
      headers['token'] = token;
      headers['x-consumer-key'] = token;
      headers['x-consumer-secret'] = token;
      
      const signature = crypto.createHmac('sha256', token).update(rawBody).digest('hex');
      headers['x-femcart-signature'] = signature;
      headers['x-invi-signature'] = signature;
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000);

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers,
        body: rawBody,
        signal: controller.signal
      });
      if (!response.ok) {
         throw new Error(`HTTP Error ${response.status}`);
      }
    } finally {
      clearTimeout(timeoutId);
    }
  }

  /**
   * Helper: Dispatches HMAC-signed HTTP POST to POS Webhook URL
   */
  private static async sendWebhook(
    url: string,
    secret: string | null,
    payload: any
  ) {
    const rawBody = JSON.stringify(payload);
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'User-Agent': 'Femcart-Webhook-Dispatcher/1.0'
    };

    if (secret) {
      const signature = crypto
        .createHmac('sha256', secret)
        .update(rawBody)
        .digest('hex');
      headers['x-femcart-signature'] = signature;
      headers['x-invi-signature'] = signature;
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 8000);

    try {
      await fetch(url, {
        method: 'POST',
        headers,
        body: rawBody,
        signal: controller.signal
      });
    } finally {
      clearTimeout(timeoutId);
    }
  }
}

export const posService = new PosService();
