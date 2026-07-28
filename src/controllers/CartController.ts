import { Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import { CartService } from '../services/cartService';
import { BadRequestError } from '../utils/errors';
import { asyncHandler, getActivePrice } from '../utils/helpers';
import { getSettingBool } from '../utils/settings';
import { BaseController } from './BaseController';
import prisma from '../config/database';

const cartService = new CartService();

export class CartController extends BaseController {
  /** Get current user's cart with items */
  getCart = asyncHandler(async (req: AuthRequest, res: Response) => {
    const cart = await cartService.getCart(req.user!.userId);

    // Calculate totals based on populated products/variants
    const subtotal = cart.items.reduce((sum, item: any) => {
      const price = item.variant ? getActivePrice(item.variant) : item.product ? getActivePrice(item.product) : 0;
      return sum + (price * item.quantity);
    }, 0);
    
    const itemCount = cart.items.reduce((sum, item) => sum + item.quantity, 0);

    res.json({ 
      success: true, 
      data: { 
        ...cart, 
        subtotal: Math.round(subtotal * 100) / 100, 
        itemCount 
      } 
    });
  });

  /** Add an item to the cart (or increment quantity) */
  addItem = asyncHandler(async (req: AuthRequest, res: Response) => {
    const { productId, variantId, quantity = 1 } = req.body;
    if (!productId && !variantId) throw new BadRequestError('Product ID or Variant ID is required');

    const ignoreStock = await getSettingBool('ignore_stock_limits');

    let stockAvailable = 0;
    if (variantId) {
      const variant = await prisma.productVariant.findUnique({ where: { id: variantId } });
      if (variant) stockAvailable = variant.stock;
    } else if (productId) {
      const product = await prisma.product.findUnique({ where: { id: productId } });
      if (product) stockAvailable = product.stock;
    }

    if (!ignoreStock && stockAvailable < quantity) throw new BadRequestError('Not enough stock available');

    const cart = await cartService.getCart(req.user!.userId);
    const existingItem = cart.items.find(i => 
      (variantId && i.variantId === variantId) || 
      (productId && i.productId === productId && !variantId)
    );

    if (existingItem) {
      existingItem.quantity += quantity;
      if (!ignoreStock && existingItem.quantity > stockAvailable) throw new BadRequestError('Not enough stock available');
    } else {
      cart.items.push({ productId: productId || null, variantId: variantId || null, quantity } as any);
    }

    // Save back to Redis (only need to save the raw ids/quantities)
    const rawItems = cart.items.map(i => ({
      productId: i.productId,
      variantId: i.variantId,
      quantity: i.quantity
    }));
    
    await cartService.syncCart(req.user!.userId, rawItems);
    res.status(201).json({ success: true, message: 'Item added to cart' });
  });

  /** Update item quantity in cart */
  updateItem = asyncHandler(async (req: AuthRequest, res: Response) => {
    const { quantity } = req.body;
    if (!quantity || quantity < 1) throw new BadRequestError('Quantity must be at least 1');

    const id = req.params.id; // Either variantId or productId now

    const cart = await cartService.getCart(req.user!.userId);
    const item = cart.items.find(i => i.variantId === id || i.productId === id);
    if (!item) throw new BadRequestError('Item not found in cart');

    const ignoreStock = await getSettingBool('ignore_stock_limits');
    const stockAvailable = item.variant ? item.variant.stock : item.product?.stock || 0;
    if (!ignoreStock && quantity > stockAvailable) throw new BadRequestError('Not enough stock');

    item.quantity = quantity;

    const rawItems = cart.items.map(i => ({
      productId: i.productId,
      variantId: i.variantId,
      quantity: i.quantity
    }));
    await cartService.syncCart(req.user!.userId, rawItems);

    res.json({ success: true, message: 'Cart item updated' });
  });

  /** Remove an item from cart */
  removeItem = asyncHandler(async (req: AuthRequest, res: Response) => {
    const id = req.params.id;
    const cart = await cartService.getCart(req.user!.userId);
    
    const newItems = cart.items.filter(i => i.variantId !== id && i.productId !== id).map(i => ({
      productId: i.productId,
      variantId: i.variantId,
      quantity: i.quantity
    }));

    await cartService.syncCart(req.user!.userId, newItems);
    res.json({ success: true, message: 'Cart item deleted successfully' });
  });

  /** Clear entire cart */
  clearCart = asyncHandler(async (req: AuthRequest, res: Response) => {
    await cartService.clearCart(req.user!.userId);
    res.json({ success: true, message: 'Cart cleared' });
  });

  /** Sync local cart to backend (replaces backend items with local or merges them) */
  syncCart = asyncHandler(async (req: AuthRequest, res: Response) => {
    const { items } = req.body;
    if (!Array.isArray(items)) {
      throw new BadRequestError('Items array is required for syncing');
    }

    const userId = req.user!.userId;

    const validItems = items.filter((i: any) => i.productId || i.variantId).map((item: any) => ({
      productId: item.productId || null,
      variantId: item.variantId || null,
      quantity: item.quantity || 1
    }));

    if (validItems.length > 0) {
      // Validate they actually exist in MySQL
      const productIds = validItems.map((i: any) => i.productId).filter((id): id is string => !!id);
      const variantIds = validItems.map((i: any) => i.variantId).filter((id): id is string => !!id);

      const [existingProducts, existingVariants] = await Promise.all([
        productIds.length > 0 ? prisma.product.findMany({ where: { id: { in: productIds } }, select: { id: true } }) : [],
        variantIds.length > 0 ? prisma.productVariant.findMany({ where: { id: { in: variantIds } }, select: { id: true } }) : [],
      ]);

      const existingProductSet = new Set(existingProducts.map((p: any) => p.id));
      const existingVariantSet = new Set(existingVariants.map((v: any) => v.id));

      const filteredItems = validItems.filter((i: any) => {
        if (i.productId && !existingProductSet.has(i.productId)) return false;
        if (i.variantId && !existingVariantSet.has(i.variantId)) return false;
        return true;
      });

      await cartService.syncCart(userId, filteredItems);
    } else {
      await cartService.clearCart(userId);
    }

    res.json({ success: true, message: 'Cart synchronized to Redis' });
  });

  /** Capture abandoned cart for guests */
  captureAbandonedCart = asyncHandler(async (req: AuthRequest, res: Response) => {
    const { name, phone, items } = req.body;
    if (!phone) throw new BadRequestError('Phone number is required');
    if (!Array.isArray(items)) throw new BadRequestError('Items array is required');
    
    const validItems = items.filter((i: any) => i.productId || i.variantId).map((item: any) => ({
      productId: item.productId || null,
      variantId: item.variantId || null,
      quantity: item.quantity || 1
    }));
    
    const result = await cartService.captureAbandonedCart(name, phone, validItems);
    res.json(result);
  });

  /** Get all abandoned carts */
  getAbandonedCarts = asyncHandler(async (req: AuthRequest, res: Response) => {
    const { isGuest } = req.query;
    const carts = await cartService.getAbandonedCarts(isGuest as string | undefined);
    res.json({ success: true, data: carts });
  });
}
