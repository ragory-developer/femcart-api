import bcrypt from 'bcryptjs';
import { Response } from 'express';
import { OrderStatus } from '@prisma/client';
import logger from '../utils/logger';
import { config } from '../config';
import prisma, { basePrisma } from '../config/database';
import { AuthRequest } from '../middleware/auth';
import { WalletService } from '../services/walletService';
import { BadRequestError, NotFoundError } from '../utils/errors';
import { stripeService } from '../services/stripeService';
import { paypalService } from '../services/paypalService';
import { sslcommerzService } from '../services/sslcommerzService';
import { nagadService } from '../services/nagadService';
import { bkashService } from '../services/bkashService';
import { sendFacebookEvent } from '../utils/facebook-capi';
import { asyncHandler, getActivePrice, parsePagination } from '../utils/helpers';
import { sendGlobalSms } from '../utils/sms';
import { sendOrderConfirmationEmail } from '../utils/emailTemplates';
import { BaseController } from './BaseController';
import { getSettingBool } from '../utils/settings';
import { CartService } from '../services/cartService';

const cartService = new CartService();

export class OrderController extends BaseController {
  private async calculateOrderTotals(
    userId: string,
    payloadItems: any[],
    couponCode?: string,
    deliveryAreaId?: string,
    deliveryCityId?: string
  ) {
    let orderItems: any[] = [];
    let cartId = null;

    const ignoreStock = await getSettingBool('ignore_stock_limits');

    if (payloadItems && payloadItems.length > 0) {
      const allProductIds = payloadItems.map((i: any) => i.productId).filter(Boolean);
      const allVariantIds = payloadItems.map((i: any) => i.variantId).filter(Boolean);
      
      const [variants, products] = await Promise.all([
        prisma.productVariant.findMany({
          where: { id: { in: allVariantIds } },
          include: { product: true }
        }),
        prisma.product.findMany({
          where: { id: { in: allProductIds } }
        })
      ]);

      const variantMap = new Map(variants.map((v: any) => [v.id, v]));
      const productMap = new Map(products.map((p: any) => [p.id, p]));

      console.log('allVariantIds:', allVariantIds);
      console.log('variants found:', variants.length);
      console.log('payloadItems:', payloadItems);

      for (const pItem of payloadItems) {
        const variant = pItem.variantId ? variantMap.get(pItem.variantId) : undefined;

        if (variant) {
          if (variant.enabled === false) continue;
          if (!ignoreStock && pItem.quantity > variant.stock) {
            throw new BadRequestError(`"${variant.product.name}" (variant) has only ${variant.stock} units in stock.`);
          }
          orderItems.push({
            productId: variant.productId,
            variantId: variant.id,
            quantity: pItem.quantity,
            price: getActivePrice(variant),
            product: variant.product,
          });
        } else {
          const product = productMap.get(pItem.productId);
          if (!product) throw new BadRequestError('Product not found in catalog');
          if (!ignoreStock && pItem.quantity > product.stock) {
            throw new BadRequestError(`"${product.name}" has only ${product.stock} units in stock. Please reduce quantity.`);
          }
          orderItems.push({
            productId: product.id,
            variantId: null,
            quantity: pItem.quantity,
            price: getActivePrice(product),
            product,
          });
        }
      }
    } else {
      // Fallback to Redis cart items
      const cart = await cartService.getCart(userId);

      if (!cart || cart.items.length === 0) {
        throw new BadRequestError('Cart is empty');
      }

      for (const item of cart.items) {
        // Skip cart items if the referenced product/variant is deleted/missing
        if (!item.product && !item.variant) {
          continue;
        }

        let resolvedProductId = item.productId;
        let resolvedProduct = item.product;

        if (item.variant) {
          if (!item.variant.productId && !resolvedProductId) {
            continue;
          }
          if (!resolvedProductId) {
            resolvedProductId = item.variant.productId;
          }
          if (!resolvedProduct) {
            const prod = await prisma.product.findUnique({ where: { id: resolvedProductId as string } });
            if (!prod) continue;
            resolvedProduct = prod;
          }

          if (item.variant.enabled === false) continue;

          if (!ignoreStock && item.quantity > item.variant.stock) {
            throw new BadRequestError(`"${resolvedProduct.name}" (variant) has only ${item.variant.stock} units in stock`);
          }

          orderItems.push({
            productId: resolvedProductId,
            variantId: item.variantId,
            quantity: item.quantity,
            price: getActivePrice(item.variant),
            product: resolvedProduct,
          });
        } else if (resolvedProduct) {
          if (!ignoreStock && item.quantity > resolvedProduct.stock) {
            throw new BadRequestError(`"${resolvedProduct.name}" has only ${resolvedProduct.stock} units in stock`);
          }

          orderItems.push({
            productId: resolvedProductId,
            variantId: null,
            quantity: item.quantity,
            price: getActivePrice(resolvedProduct),
            product: resolvedProduct,
          });
        }
      }
      cartId = null; // No longer needed
    }

    if (orderItems.length === 0) throw new BadRequestError('No items to order');

    // Calculate subtotal
    let subtotal = orderItems.reduce((sum, item) => sum + item.price * item.quantity, 0);
    subtotal = Math.round(subtotal * 100) / 100;

    // Calculate delivery fee dynamically
    let deliveryFee = 0; // Default to 0 until area/city is selected

    if (deliveryAreaId) {
      const area = await prisma.area.findUnique({ where: { id: deliveryAreaId } });
      logger.debug(`Found area: ${area?.name}, charge: ${area?.deliveryCharge}`);
      if (area && area.deliveryCharge > 0) {
        deliveryFee = area.deliveryCharge;
      } else if (deliveryCityId) {
        const city = await prisma.city.findUnique({ where: { id: deliveryCityId } });
        logger.debug(`Area charge 0, checking city: ${city?.name}, charge: ${city?.deliveryCharge}`);
        if (city && city.deliveryCharge > 0) {
          deliveryFee = city.deliveryCharge;
        }
      }
    } else if (deliveryCityId) {
      const city = await prisma.city.findUnique({ where: { id: deliveryCityId } });
      logger.debug(`No area, checking city: ${city?.name}, charge: ${city?.deliveryCharge}`);
      if (city && city.deliveryCharge > 0) {
        deliveryFee = city.deliveryCharge;
      }
    }

    logger.debug(`Final deliveryFee: ${deliveryFee}`);

    let discount = 0;
    let validCouponId = null;

    // Apply coupon if provided
    if (couponCode) {
      const coupon = await prisma.coupon.findUnique({ where: { code: couponCode } });
      if (coupon && coupon.active && coupon.usedCount < coupon.maxUses && (!coupon.expiresAt || coupon.expiresAt > new Date())) {
        if (subtotal >= coupon.minOrder) {
          discount = coupon.type === 'PERCENT' ? (subtotal * coupon.discount) / 100 : coupon.discount;
          discount = Math.min(discount, subtotal); // Don't exceed subtotal
          validCouponId = coupon.id;
        } else {
          throw new BadRequestError(`Coupon requires a minimum order of ৳${coupon.minOrder}`);
        }
      } else {
        throw new BadRequestError('Coupon is invalid or has expired');
      }
    }

    const total = Math.round((subtotal + deliveryFee - discount) * 100) / 100;

    return { subtotal, deliveryFee, discount, total, orderItems, cartId, validCouponId };
  }

  /** Calculate order totals dynamically without placing order */
  calculate = asyncHandler(async (req: AuthRequest, res: Response) => {
    // Allow guests - use a placeholder userId that won't match any cart
    const userId = req.user?.userId || 'guest';
    const { items: payloadItems, couponCode, deliveryAreaId, deliveryCityId } = req.body;

    if (!payloadItems || payloadItems.length === 0) {
      return res.status(400).json({ success: false, message: 'Cart items are required' });
    }

    const { subtotal, deliveryFee, discount, total, orderItems } = await this.calculateOrderTotals(
      userId,
      payloadItems,
      couponCode,
      deliveryAreaId,
      deliveryCityId
    );

    res.json({ success: true, data: { subtotal, deliveryFee, discount, total, orderItems } });
  });

  /** Place a new order from the user's cart */
  create = asyncHandler(async (req: AuthRequest, res: Response) => {
    let userId = req.user?.userId;
    const { 
      deliveryAddress, deliveryCity, deliveryArea, deliveryCityId, deliveryAreaId, 
      deliveryStateId, deliverySlot, paymentMethod, couponCode, notes, 
      items: payloadItems,
      customerName,
      customerPhone,
      customerEmail
    } = req.body;

    if (!deliveryAddress) throw new BadRequestError('Delivery address is required');
    if (!customerEmail) throw new BadRequestError('Email address is required for checkout receipts');

    // Handle purely guest checkout without an account/token
    if (!userId) {
      if (!customerPhone) throw new BadRequestError('Phone number is required for checkout');
      
      let user = await basePrisma.user.findFirst({ where: { phone: customerPhone } });
      if (user && user.deletedAt) {
        throw new BadRequestError('This phone number is associated with an account in the Trash. Please use a different phone number.');
      }
      if (!user) {
        const randomPassword = Math.random().toString(36).slice(-10) + Math.random().toString(36).slice(-10).toUpperCase();
        const hashedPassword = await bcrypt.hash(randomPassword, 12);
        user = await prisma.user.create({
          data: {
            name: customerName || 'Guest User',
            phone: customerPhone,
            email: customerEmail,
            password: hashedPassword,
            isGuest: true,
            role: 'USER',
          }
        });
      }
      userId = user.id;
    }

    // Fetch user for snapshotting if name/phone not provided in body
    const user = await prisma.user.findUnique({ 
      where: { id: userId },
      select: { name: true, phone: true, isGuest: true, email: true } 
    });

    if (user && !user.email && customerEmail) {
      await prisma.user.update({ where: { id: userId }, data: { email: customerEmail } });
    }

    const finalName = customerName || user?.name || 'Guest';
    const finalPhone = customerPhone || user?.phone || '';

    const { subtotal, deliveryFee, discount, total, orderItems, cartId, validCouponId } = await this.calculateOrderTotals(
      userId,
      payloadItems,
      couponCode,
      deliveryAreaId,
      deliveryCityId
    );

    // Calculate reward points
    let rewardPoints = 0;
    if (user && !user.isGuest) {
      const [rewardAmountSetting, rewardEarnedSetting] = await Promise.all([
        prisma.setting.findUnique({ where: { key: 'reward_points_amount' } }),
        prisma.setting.findUnique({ where: { key: 'reward_points_earned' } })
      ]);
      const rewardAmount = parseFloat(rewardAmountSetting?.value || '0');
      const rewardEarned = parseInt(rewardEarnedSetting?.value || '0');

      if (rewardAmount > 0 && rewardEarned > 0) {
        const applicableValue = subtotal - discount; // exclude delivery charge
        if (applicableValue > 0) {
          rewardPoints = Math.floor(applicableValue / rewardAmount) * rewardEarned;
        }
      }
    }

    // Create order with items inside a transaction
    const order = await prisma.$transaction(async (tx: any) => {
      // If a coupon was applied, double check and increment usedCount inside transaction
      if (validCouponId) {
        const currentCoupon = await tx.coupon.findUnique({ where: { id: validCouponId } });
        if (!currentCoupon || currentCoupon.usedCount >= currentCoupon.maxUses || (currentCoupon.expiresAt && currentCoupon.expiresAt < new Date())) {
          throw new BadRequestError('Coupon reached max uses or expired during checkout');
        }
        await tx.coupon.update({ where: { id: validCouponId }, data: { usedCount: { increment: 1 } } });
      }

      const newOrder = await tx.order.create({
        data: {
          userId,
          customerName: finalName,
          customerPhone: finalPhone,
          subtotal,
          deliveryFee,
          discount,
          rewardPoints,
          total,
          deliveryAddress,
          deliveryCity,
          deliveryArea,
          deliveryStateId,
          deliveryCityId,
          deliveryAreaId,
          deliverySlot,
          paymentMethod: paymentMethod || 'COD',
          paymentStatus: (paymentMethod || 'COD') === 'COD' ? 'PENDING' : 'UNPAID',
          couponCode,
          notes,
          items: {
            create: orderItems.map((item) => ({
              productId: item.productId,
              variantId: item.variantId || null,
              quantity: item.quantity,
              price: item.price,
            })),
          },
        },
        include: { items: { include: { product: { select: { id: true, name: true, image: true } }, variant: { select: { id: true, image: true, attributes: true } } } } },
      });

      // Decrease stock for each product/variant safely
      const ignoreStock = await getSettingBool('ignore_stock_limits');

      for (const item of orderItems) {
        if (item.variantId) {
          const variant = await tx.productVariant.findUnique({ where: { id: item.variantId } });
          if (!variant) throw new BadRequestError(`Variant ${item.variantId} not found`);
          
          if (!ignoreStock) {
            const updated = await tx.productVariant.updateMany({
              where: { 
                id: item.variantId,
                stock: { gte: item.quantity }
              },
              data: { stock: { decrement: item.quantity } }
            });
            if (updated.count === 0) {
              throw new BadRequestError(`Not enough stock for variant. Available: ${variant.stock}`);
            }
            await tx.product.update({
              where: { id: item.productId },
              data: { stock: { decrement: item.quantity } }
            });
          } else {
            await tx.productVariant.update({
              where: { id: item.variantId },
              data: { stock: { decrement: item.quantity } },
            });
            await tx.product.update({
              where: { id: item.productId },
              data: { stock: { decrement: item.quantity } }
            });
          }
        } else if (item.productId) {
          const product = await tx.product.findUnique({ where: { id: item.productId } });
          if (!product) throw new BadRequestError(`Product ${item.productId} not found`);
          
          if (!ignoreStock) {
            const updated = await tx.product.updateMany({
              where: { 
                id: item.productId,
                stock: { gte: item.quantity }
              },
              data: { stock: { decrement: item.quantity } }
            });
            if (updated.count === 0) {
              throw new BadRequestError(`Not enough stock for product. Available: ${product.stock}`);
            }
          } else {
            await tx.product.update({
              where: { id: item.productId },
              data: { stock: { decrement: item.quantity } },
            });
          }
        }
      }

      await cartService.clearCart(userId);

      // Deduct from global wallet if configured
      if (config.orderDeductionAmount > 0) {
        await WalletService.adjustGlobalBalance(
          -config.orderDeductionAmount,
          'DEDUCTION',
          `Order #${newOrder.id} auto-deduction`,
          undefined,
          tx
        );
      }

      return newOrder;
    });

    // Send Facebook Conversions API event (async/non-blocking)
    const clientIp = req.ip || req.headers['x-forwarded-for']?.toString();
    const userAgent = req.headers['user-agent'];

    sendFacebookEvent({
      eventName: 'Purchase',
      eventId: order.id,
      eventSourceUrl: `${req.protocol}://${req.get('host')}${req.originalUrl}`,
      userData: {
        email: customerEmail || user?.email || (req.user as any)?.email,
        phone: order.customerPhone || undefined,
        clientIpAddress: clientIp,
        userAgent: userAgent,
        externalId: order.userId,
      },
      customData: {
        value: order.total,
        currency: 'BDT',
        contentIds: order.items.map((i: any) => i.productId),
        contentType: 'product',
        orderId: order.id,
      }
    }).catch(err => console.error('[FB-CAPI] Execution error:', err));

    let paymentUrl = null;
    let paymentData = null;

    // Convert to USD for international gateways that may not support BDT natively
    const exchangeRate = 120; // 1 USD = 120 BDT
    const amountInUSD = Number((order.total / exchangeRate).toFixed(2));

    if (order.paymentMethod === 'STRIPE') {
      try {
        const session = await stripeService.createCheckoutSession(order.id, amountInUSD, 'usd');
        paymentUrl = session.url;
      } catch (e: any) {
        console.error('Stripe session error', e);
        return res.status(400).json({ success: false, message: 'Stripe payment could not be initialized. Please verify configuration or try another payment method.' });
      }
    } else if (order.paymentMethod === 'PAYPAL') {
      try {
        const paypalOrder = await paypalService.createOrder(order.id, amountInUSD);
        paymentData = { orderId: paypalOrder.id }; // Used by native paypal button
        const approveLink = paypalOrder.links.find((l: any) => l.rel === 'approve');
        if (approveLink) {
          paymentUrl = approveLink.href; // Fallback redirect if needed
        }
      } catch (e: any) {
        console.error('PayPal order error', e);
        return res.status(400).json({ success: false, message: 'PayPal payment could not be initialized. Please verify configuration or try another payment method.' });
      }
    } else if (order.paymentMethod === 'CARD') {
      try {
        const session = await sslcommerzService.initPayment(order.id, order.total, 'BDT', {
          name: order.customerName,
          phone: order.customerPhone,
          address: order.deliveryAddress,
          city: order.deliveryCity,
        });
        paymentUrl = session.url;
      } catch (e: any) {
        console.error('SSL Commerz session error', e);
        return res.status(400).json({ success: false, message: 'SSL Commerz payment could not be initialized. Please try another payment method.' });
      }
    } else if (order.paymentMethod === 'NAGAD') {
      try {
        const session = await nagadService.initPayment(order.id, order.total);
        paymentUrl = session.url;
      } catch (e: any) {
        console.error('Nagad session error', e);
        return res.status(400).json({ success: false, message: 'Nagad payment could not be initialized. Please verify configuration or try another payment method.' });
      }
    } else if (order.paymentMethod === 'BKASH') {
      try {
        const session = await bkashService.createPayment(order.id, order.total);
        paymentUrl = session.url;
      } catch (e: any) {
        console.error('bKash session error', e);
        return res.status(400).json({ success: false, message: 'bKash payment could not be initialized. Please verify configuration or try another payment method.' });
      }
    }

    const emailToSend = customerEmail || user?.email || (req.user as any)?.email;
    if (emailToSend) {
      sendOrderConfirmationEmail(order, emailToSend).catch(err => console.error('[Email] Failed to send initial order receipt:', err));
    }

    res.status(201).json({ success: true, data: order, paymentUrl, paymentData });
  });

  /** Get current user's orders */
  getMyOrders = asyncHandler(async (req: AuthRequest, res: Response) => {
    const { page, limit, skip } = parsePagination(req.query as any);
    const userId = req.user!.userId;

    const [orders, total] = await Promise.all([
      prisma.order.findMany({
        where: { userId },
        include: { items: { include: { product: { select: { id: true, name: true, image: true, slug: true } }, variant: { select: { id: true, image: true, attributes: true } } } } },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      prisma.order.count({ where: { userId } }),
    ]);

    res.json({ success: true, data: orders, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } });
  });

  /** Get single order by ID */
  getById = asyncHandler(async (req: AuthRequest, res: Response) => {
    const order = await prisma.order.findUnique({
      where: { id: req.params.id as string },
      include: {
        user: { select: { id: true, name: true, email: true, phone: true } },
        items: { include: { product: { select: { id: true, name: true, image: true, slug: true } }, variant: { select: { id: true, image: true, attributes: true } } } },
      },
    });
    if (!order) throw new NotFoundError('Order not found');

    // Users can only see their own orders (unless admin)
    if (req.user!.role !== 'ADMIN' && order.userId !== req.user!.userId) {
      throw new NotFoundError('Order not found');
    }

    res.json({ success: true, data: order });
  });

  /** Admin: get all orders */
  getAllOrders = asyncHandler(async (req: AuthRequest, res: Response) => {
    const { page, limit, skip } = parsePagination(req.query as any);
    const { status, couponCode, search, userId } = req.query;

    const where: any = {};
    if (status) where.status = status;
    if (couponCode) where.couponCode = couponCode;
    if (userId) where.userId = userId;
    
    if (search) {
      where.OR = [
        { id: { contains: search as string } },
        { user: { name: { contains: search as string } } },
        { user: { phone: { contains: search as string } } },
      ];
    }

    const [orders, total] = await Promise.all([
      prisma.order.findMany({
        where,
        include: {
          user: { 
            select: { 
              id: true, name: true, email: true, phone: true, isGuest: true, rewardPoints: true,
              _count: { select: { orders: true } }
            } 
          },
          items: { include: { product: { select: { id: true, name: true, image: true } }, variant: { select: { id: true, image: true, attributes: true } } } },
          orderNotes: { orderBy: { createdAt: 'desc' } },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      prisma.order.count({ where }),
    ]);
    logger.debug(`Fetched ${orders.length} orders for admin. Total count in DB: ${total}`);

    res.json({ success: true, data: orders, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } });
  });

  /** Admin: update order status */
  updateStatus = asyncHandler(async (req: AuthRequest, res: Response) => {
    const { status, trackingNumber, trackingUrl, courierName } = req.body;
    const validStatuses = Object.values(OrderStatus);
    if (!validStatuses.includes(status as any)) {
      throw new BadRequestError(`Invalid status. Must be one of: ${validStatuses.join(', ')}`);
    }

    // Pre-flight check and SMS data capture — done outside transaction for speed
    const currentOrder = await prisma.order.findUnique({ 
      where: { id: req.params.id as string },
      select: { id: true, status: true, customerPhone: true, user: { select: { phone: true } } }
    });
    
    if (!currentOrder) throw new NotFoundError('Order not found');

    const order = await prisma.$transaction(async (tx: any) => {
      // Fetch fresh order state inside transaction to prevent race conditions
      const txOrder = await tx.order.findUnique({ 
        where: { id: req.params.id as string },
        include: { user: true, items: true }
      });
      if (!txOrder) throw new NotFoundError('Order not found');

      const hasTrackingUpdates = trackingNumber !== undefined || trackingUrl !== undefined || courierName !== undefined;

      // If status hasn't changed and no tracking updates, just return it
      if (txOrder.status === status && !hasTrackingUpdates) return txOrder;

      const updateData: any = {
        status, 
        paymentStatus: status === 'COMPLETED' ? 'PAID' : undefined
      };

      if (trackingNumber !== undefined) updateData.trackingNumber = trackingNumber;
      if (trackingUrl !== undefined) updateData.trackingUrl = trackingUrl;
      if (courierName !== undefined) updateData.courierName = courierName;
      
      if (status === 'SHIPPED' && txOrder.status !== 'SHIPPED') {
        updateData.shippedAt = new Date();
      }

      const updatedOrder = await tx.order.update({
        where: { id: req.params.id as string },
        data: updateData,
      });

      // Audit Log Note
      await tx.orderNote.create({
        data: {
          orderId: req.params.id as string,
          content: `Order status updated to ${status} by Admin.`,
          isSystem: true
        }
      });

      // Reward points handling
      const isCurrentlyRewardable = ['COMPLETED'].includes(txOrder.status);
      const isNewRewardable = ['COMPLETED'].includes(status);

      if (!isCurrentlyRewardable && isNewRewardable) {
        // Add points
        if (txOrder.rewardPoints > 0 && !txOrder.user.isGuest) {
          await tx.user.update({
            where: { id: txOrder.userId },
            data: { rewardPoints: { increment: txOrder.rewardPoints } }
          });
        }
      } else if (isCurrentlyRewardable && !isNewRewardable) {
        // Remove points (e.g. was DELIVERED, now CANCELLED or REFUNDED)
        if (txOrder.rewardPoints > 0 && !txOrder.user.isGuest) {
          await tx.user.update({
            where: { id: txOrder.userId },
            data: { rewardPoints: { decrement: txOrder.rewardPoints } }
          });
        }
      }

      // Restock handling if cancelled
      if (txOrder.status !== 'CANCELLED' && status === 'CANCELLED') {
        for (const item of txOrder.items) {
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
      } else if (txOrder.status === 'CANCELLED' && status !== 'CANCELLED') {
         // if un-cancelling, we should deduct stock again
        const ignoreStock = await getSettingBool('ignore_stock_limits');

        for (const item of txOrder.items) {
          if (item.variantId) {
            const variant = await tx.productVariant.findUnique({ where: { id: item.variantId } });
            if (!ignoreStock && variant && variant.stock < item.quantity) {
              throw new BadRequestError(`Not enough stock to un-cancel variant. Available: ${variant.stock}`);
            }
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
            const product = await tx.product.findUnique({ where: { id: item.productId } });
            if (!ignoreStock && product && product.stock < item.quantity) {
              throw new BadRequestError(`Not enough stock to un-cancel product. Available: ${product.stock}`);
            }
            await tx.product.update({
              where: { id: item.productId },
              data: { stock: { decrement: item.quantity } }
            });
          }
        }
      }

      return updatedOrder;
    });

    // Fire automated SMS Notification (outside transaction so it doesn't block)
    const phoneToNotify = currentOrder.customerPhone || currentOrder.user?.phone;
    if (currentOrder.status !== status && phoneToNotify) {
      let message = '';
      const shortId = currentOrder.id.slice(-6).toUpperCase();
      
      if (status === 'SHIPPED') {
        message = `Your Femcart order #${shortId} has been shipped and is on its way!`;
      } else if (status === 'DELIVERED') {
        message = `Your Femcart order #${shortId} has been delivered. Thank you for shopping with us!`;
      } else if (status === 'CANCELLED') {
        message = `Your Femcart order #${shortId} has been cancelled. Please contact support for any queries.`;
      }
      
      if (message) {
        sendGlobalSms(phoneToNotify, message, 'order_status_update').catch(err => console.error('[SMS] Failed to send order status SMS:', err));
      }
    }

    const isConfirming = ['CONFIRMED', 'PROCESSING', 'COMPLETED'].includes(status);
    const wasAlreadyConfirmed = ['CONFIRMED', 'PROCESSING', 'SHIPPED', 'DELIVERED', 'COMPLETED'].includes(currentOrder.status);

    if (isConfirming && !wasAlreadyConfirmed) {
      const fullOrder = await prisma.order.findUnique({ 
        where: { id: req.params.id as string }, 
        include: { user: true, items: { include: { product: true, variant: { include: { product: true } } } } } 
      });
      if (fullOrder && fullOrder.user?.email) {
        sendOrderConfirmationEmail(fullOrder, fullOrder.user.email).catch(err => console.error('[Email] Failed to send Order Confirmation receipt:', err));
      }
    }

    res.json({ success: true, data: order });
  });

  /** User: Pay for an existing order (Simulated/Simpler payment) */
  pay = asyncHandler(async (req: AuthRequest, res: Response) => {
    const orderId = req.params.id as string;
    const userId = req.user!.userId;

    const order = await prisma.order.findUnique({ where: { id: orderId } });
    
    if (!order) throw new NotFoundError('Order not found');
    if (order.userId !== userId) throw new NotFoundError('Order not found');
    if (order.paymentStatus === 'PAID') throw new BadRequestError('Order is already paid');

    // Here we would typically redirect to SSLCommerz or bKash
    // For now, let's just mark as PAID to simulate a successful transaction
    const updatedOrder = await prisma.order.update({
      where: { id: orderId },
      data: { paymentStatus: 'PAID' },
      include: { user: true, items: { include: { product: true, variant: { include: { product: true } } } } }
    });

    if (updatedOrder.user?.email) {
      sendOrderConfirmationEmail(updatedOrder, updatedOrder.user.email).catch(err => console.error('[Email] Failed to send PAID receipt:', err));
    }

    res.json({ success: true, data: updatedOrder, message: 'Payment successful (Simulated)' });
  });

  /** Admin: process returns and damages */
  processReturn = asyncHandler(async (req: AuthRequest, res: Response) => {
    const { id } = req.params;
    const { items, refundShipping, refundMethod } = req.body as { 
      items: { orderItemId: string; quantity: number; isDamaged: boolean; reason: string }[];
      refundShipping?: boolean;
      refundMethod?: 'WALLET' | 'ORIGINAL' | 'MANUAL';
    };

    const order = await prisma.order.findUnique({ where: { id: id as string }, include: { items: true } });
    if (!order) throw new NotFoundError('Order not found');
    
    if (order.status !== 'DELIVERED' && order.status !== 'COMPLETED' && order.status !== 'PARTIALLY_RETURNED') {
      throw new BadRequestError('Returns can only be processed on delivered or completed orders.');
    }

    const updatedOrder = await prisma.$transaction(async (tx: any) => {
      let totalRefund = 0;
      const discountRatio = order.subtotal > 0 ? (order.discount / order.subtotal) : 0;

      for (const reqItem of items) {
        if (!reqItem.quantity || reqItem.quantity <= 0) continue;
        
        const orderItem = order.items.find((i: any) => i.id === reqItem.orderItemId);
        if (!orderItem) throw new BadRequestError(`Item ${reqItem.orderItemId} not in order`);
        
        const availableToReturn = orderItem.quantity - orderItem.returnedQuantity - orderItem.damagedQuantity;
        if (reqItem.quantity > availableToReturn) {
          throw new BadRequestError(`Cannot return more than available for product ${orderItem.productId || orderItem.variantId}`);
        }

        const rawItemRefund = reqItem.quantity * orderItem.price;
        const actualItemRefund = rawItemRefund * (1 - discountRatio);
        totalRefund += actualItemRefund;

        // Update OrderItem (Only increment returnedQuantity for financial record)
        const updateData: any = { 
          returnReason: reqItem.reason || undefined,
          returnedQuantity: { increment: reqItem.quantity }
        };
        await tx.orderItem.update({ where: { id: orderItem.id }, data: updateData });
      }

      if (refundShipping && order.deliveryFee > 0) {
        totalRefund += order.deliveryFee;
      }

      // Format to 2 decimal places
      totalRefund = Math.round(totalRefund * 100) / 100;

      if (refundMethod === 'WALLET' && totalRefund > 0) {
         await tx.walletTransaction.create({
            data: {
              userId: order.userId,
              amount: totalRefund,
              type: 'REFUND',
              status: 'COMPLETED',
              note: `Refund for Order #${order.id.slice(-6).toUpperCase()}`
            }
         });
      }

      // Calculate new overall status
      const updatedItems = await tx.orderItem.findMany({ where: { orderId: id as string } });
      const totalQuantity = updatedItems.reduce((acc: any, i: any) => acc + i.quantity, 0);
      const totalReturned = updatedItems.reduce((acc: any, i: any) => acc + i.returnedQuantity + i.damagedQuantity, 0);
      
      const newStatus = totalReturned === totalQuantity ? 'RETURNED' : 'PARTIALLY_RETURNED';
      const methodLabel = refundMethod ? ` to ${refundMethod}` : '';

      // Audit Log Note
      await tx.orderNote.create({
        data: {
          orderId: id as string,
          content: `Refund processed${methodLabel}: ৳${totalRefund.toFixed(2)} for ${items.length} item(s).${refundShipping ? ' (Includes Shipping)' : ''}`,
          isSystem: true
        }
      });

      return tx.order.update({
        where: { id: id as string },
        data: { 
          refundAmount: { increment: totalRefund },
          status: newStatus 
        },
        include: { items: true, user: true, orderNotes: { orderBy: { createdAt: 'desc' } } }
      });
    });

    res.json({ success: true, data: updatedOrder });
  });

  /** Admin: Add manual order note */
  addNote = asyncHandler(async (req: AuthRequest, res: Response) => {
    const { id } = req.params;
    const { content } = req.body;

    if (!content) throw new BadRequestError('Note content is required');

    const note = await prisma.orderNote.create({
      data: {
        orderId: id as string,
        content,
        isSystem: false
      }
    });

    res.status(201).json({ success: true, data: note });
  });

  /** Webhooks & Callbacks */
  
  sslcommerzSuccess = asyncHandler(async (req: any, res: any) => {
    const valId = req.body?.val_id;
    if (!valId) {
      res.redirect(`${process.env.FRONTEND_URL || 'http://localhost:3000'}/checkout?error=invalid_payment`);
      return;
    }
    try {
      const result = await sslcommerzService.validatePayment(valId);
      if (result && result.status === 'VALID' || result.status === 'VALIDATED') {
        const orderId = result.tran_id;
        await prisma.order.update({
          where: { id: orderId },
          data: { paymentStatus: 'PAID', paymentMethod: 'CARD', paymentId: result.val_id },
        });
        res.redirect(`${process.env.FRONTEND_URL || 'http://localhost:3000'}/order-success?orderId=${orderId}`);
      } else {
        res.redirect(`${process.env.FRONTEND_URL || 'http://localhost:3000'}/checkout?error=payment_failed`);
      }
    } catch (error) {
      res.redirect(`${process.env.FRONTEND_URL || 'http://localhost:3000'}/checkout?error=payment_failed`);
    }
  });

  sslcommerzFail = asyncHandler(async (req: any, res: any) => {
    const orderId = req.body?.tran_id;
    if (orderId) {
      await prisma.order.update({
        where: { id: orderId },
        data: { paymentStatus: 'FAILED', paymentMethod: 'CARD' },
      });
    }
    res.redirect(`${process.env.FRONTEND_URL || 'http://localhost:3000'}/checkout?error=payment_failed`);
  });

  sslcommerzCancel = asyncHandler(async (req: any, res: any) => {
    res.redirect(`${process.env.FRONTEND_URL || 'http://localhost:3000'}/checkout?error=payment_cancelled`);
  });

  sslcommerzIpn = asyncHandler(async (req: any, res: any) => {
    const valId = req.body?.val_id;
    if (valId) {
      try {
        const result = await sslcommerzService.validatePayment(valId);
        if (result && result.status === 'VALID' || result.status === 'VALIDATED') {
          const orderId = result.tran_id;
          await prisma.order.update({
            where: { id: orderId },
            data: { paymentStatus: 'PAID', paymentMethod: 'CARD', paymentId: result.val_id },
          });
        }
      } catch (e) {
        // IPN error
      }
    }
    res.status(200).send('OK');
  });

  nagadCallback = asyncHandler(async (req: any, res: any) => {
    const paymentRefId = req.query.payment_ref_id as string;
    const status = req.query.status as string;

    if (!paymentRefId || status !== 'Success') {
      res.redirect(`${process.env.FRONTEND_URL || 'http://localhost:3000'}/checkout?error=payment_failed`);
      return;
    }

    try {
      const verification = await nagadService.verifyPayment(paymentRefId);
      if (verification && verification.status === 'Success') {
        const orderId = verification.orderId;
        await prisma.order.update({
          where: { id: orderId },
          data: { paymentStatus: 'PAID', paymentMethod: 'NAGAD', paymentId: paymentRefId },
        });
        res.redirect(`${process.env.FRONTEND_URL || 'http://localhost:3000'}/order-success?orderId=${orderId}`);
      } else {
        res.redirect(`${process.env.FRONTEND_URL || 'http://localhost:3000'}/checkout?error=payment_failed`);
      }
    } catch (error) {
      res.redirect(`${process.env.FRONTEND_URL || 'http://localhost:3000'}/checkout?error=payment_failed`);
    }
  });

  bkashCallback = asyncHandler(async (req: any, res: any) => {
    const paymentID = req.query.paymentID as string;
    const status = req.query.status as string;

    if (!paymentID || status !== 'success') {
      res.redirect(`${process.env.FRONTEND_URL || 'http://localhost:3000'}/checkout?error=payment_failed`);
      return;
    }

    try {
      const executeResponse = await bkashService.executePayment(paymentID);
      if (executeResponse && executeResponse.statusCode === '0000') {
        const orderId = executeResponse.merchantInvoiceNumber;
        await prisma.order.update({
          where: { id: orderId },
          data: { paymentStatus: 'PAID', paymentMethod: 'BKASH', paymentId: executeResponse.trxID },
        });
        res.redirect(`${process.env.FRONTEND_URL || 'http://localhost:3000'}/order-success?orderId=${orderId}`);
      } else {
        res.redirect(`${process.env.FRONTEND_URL || 'http://localhost:3000'}/checkout?error=payment_failed`);
      }
    } catch (error) {
      res.redirect(`${process.env.FRONTEND_URL || 'http://localhost:3000'}/checkout?error=payment_failed`);
    }
  });

  /** Admin: Get all returned items for triage queue */
  getReturnedItems = asyncHandler(async (req: AuthRequest, res: Response) => {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;

    const allReturned = await prisma.orderItem.findMany({
      where: { returnedQuantity: { gt: 0 } },
      include: {
        product: { select: { id: true, name: true, slug: true, price: true, images: true } },
        variant: { include: { product: { select: { id: true, name: true, slug: true, price: true, images: true } } } },
        order: { select: { id: true, status: true, createdAt: true, user: { select: { name: true, email: true } } } }
      },
      orderBy: { order: { createdAt: 'desc' } }
    });

    // Filter to only items that have pending triage
    const pendingItems = allReturned.filter((item: any) => item.returnedQuantity > (item.restockedQuantity + item.damagedQuantity));

    const total = pendingItems.length;
    const skip = (page - 1) * limit;
    const paginatedItems = pendingItems.slice(skip, skip + limit);

    res.json({ success: true, data: paginatedItems, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } });
  });

  /** Admin: Get all damaged items */
  getDamagedItems = asyncHandler(async (req: AuthRequest, res: Response) => {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;
    const skip = (page - 1) * limit;

    const where = { damagedQuantity: { gt: 0 } };
    
    const [items, total] = await Promise.all([
      prisma.orderItem.findMany({
        where,
        include: {
          product: { select: { id: true, name: true, slug: true, price: true, images: true } },
          variant: { include: { product: { select: { id: true, name: true, slug: true, price: true, images: true } } } },
          order: { select: { id: true, status: true, createdAt: true, user: { select: { name: true, email: true } } } }
        },
        orderBy: { order: { createdAt: 'desc' } },
        skip,
        take: limit
      }),
      prisma.orderItem.count({ where })
    ]);

    res.json({ success: true, data: items, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } });
  });

  /** Admin: Triage a returned item (Restock or Damaged) */
  triageReturnedItem = asyncHandler(async (req: AuthRequest, res: Response) => {
    const { orderItemId } = req.params;
    const { action, quantity } = req.body as { action: 'RESTOCK' | 'DAMAGED'; quantity: number };

    if (!quantity || quantity <= 0) {
      throw new BadRequestError('Invalid quantity');
    }

    const orderItem = await prisma.orderItem.findUnique({ where: { id: orderItemId } });
    if (!orderItem) throw new NotFoundError('Order item not found');

    const pendingQuantity = orderItem.returnedQuantity - orderItem.restockedQuantity - orderItem.damagedQuantity;
    
    if (quantity > pendingQuantity) {
      throw new BadRequestError('Cannot triage more than the pending returned quantity');
    }

    await prisma.$transaction(async (tx: any) => {
      if (action === 'RESTOCK') {
        await tx.orderItem.update({
          where: { id: orderItemId },
          data: { restockedQuantity: { increment: quantity } }
        });

        if (orderItem.variantId) {
          await tx.productVariant.update({ where: { id: orderItem.variantId }, data: { stock: { increment: quantity } } });
        } else if (orderItem.productId) {
          await tx.product.update({ where: { id: orderItem.productId }, data: { stock: { increment: quantity } } });
        }
      } else if (action === 'DAMAGED') {
        await tx.orderItem.update({
          where: { id: orderItemId },
          data: { damagedQuantity: { increment: quantity } }
        });
      }

      await tx.orderNote.create({
        data: {
          orderId: orderItem.orderId,
          content: `Triaged ${quantity} returned item(s) as ${action}.`,
          isSystem: true
        }
      });
    });

    res.json({ success: true, message: `Successfully marked ${quantity} item(s) as ${action}` });
  });

  /** Admin: Restock damaged item */
  restockDamagedItem = asyncHandler(async (req: AuthRequest, res: Response) => {
    const { orderItemId } = req.params;
    const quantity = parseInt(req.body.quantity as string);

    if (!quantity || quantity <= 0) {
      throw new BadRequestError('Invalid quantity');
    }

    const orderItem = await prisma.orderItem.findUnique({ where: { id: orderItemId } });
    if (!orderItem) throw new NotFoundError('Order item not found');
    
    if (orderItem.damagedQuantity < quantity) {
      throw new BadRequestError('Cannot restock more than the damaged quantity');
    }

    await prisma.$transaction(async (tx: any) => {
      await tx.orderItem.update({
        where: { id: orderItemId },
        data: {
          damagedQuantity: { decrement: quantity },
          restockedQuantity: { increment: quantity }
        }
      });

      if (orderItem.variantId) {
        await tx.productVariant.update({ where: { id: orderItem.variantId }, data: { stock: { increment: quantity } } });
      } else if (orderItem.productId) {
        await tx.product.update({ where: { id: orderItem.productId }, data: { stock: { increment: quantity } } });
      }
      
      await tx.orderNote.create({
        data: {
          orderId: orderItem.orderId,
          content: `Restocked ${quantity} damaged item(s) back to inventory.`,
          isSystem: true
        }
      });
    });

    res.json({ success: true, message: `Successfully restocked ${quantity} damaged item(s)` });
  });
}
