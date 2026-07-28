import { redis } from '../core/redis/RedisManager';
import { KeyFactory } from '../core/redis/KeyFactory';
import prisma, { basePrisma } from '../config/database';

export interface CartItemInput {
  productId?: string | null;
  variantId?: string | null;
  quantity: number;
}

export interface RedisCart {
  userId: string;
  items: CartItemInput[];
  updatedAt: string;
}

const CART_TTL_SECONDS = 30 * 24 * 60 * 60; // 30 days

export class CartService {
  /**
   * Get the active cart for a user from Redis, populated with MySQL product data
   */
  async getCart(userId: string) {
    const key = KeyFactory.cart(userId);
    const data = await redis.get(key);
    const cart: RedisCart = data ? JSON.parse(data) : { userId, items: [], updatedAt: new Date().toISOString() };

    // Populate products and variants from MySQL
    const productIds = cart.items.map(i => i.productId).filter((id): id is string => !!id);
    const variantIds = cart.items.map(i => i.variantId).filter((id): id is string => !!id);

    const [products, variants] = await Promise.all([
      productIds.length > 0 
        ? prisma.product.findMany({
            where: { id: { in: productIds } },
            select: { id: true, name: true, slug: true, price: true, specialPrice: true, specialPriceStart: true, specialPriceEnd: true, comparePrice: true, image: true, stock: true, unit: true }
          })
        : [],
      variantIds.length > 0
        ? prisma.productVariant.findMany({
            where: { id: { in: variantIds } }
          })
        : []
    ]);

    const productMap = new Map(products.map((p: any) => [p.id, p]));
    const variantMap = new Map(variants.map((v: any) => [v.id, v]));

    // Format items exactly how the frontend expects them
    const populatedItems = cart.items.map(item => {
      const product = item.productId ? productMap.get(item.productId) : null;
      const variant = item.variantId ? variantMap.get(item.variantId) : null;
      
      return {
        id: item.variantId || item.productId, // Frontend uses this logic
        productId: item.productId,
        variantId: item.variantId,
        quantity: item.quantity,
        product,
        variant
      };
    }).filter(item => item.product || item.variant); // Remove if deleted from DB

    return {
      userId,
      items: populatedItems,
      updatedAt: cart.updatedAt
    };
  }

  /**
   * Sync the cart by completely replacing the items (Frontend is source of truth)
   */
  async syncCart(userId: string, items: CartItemInput[]) {
    const key = KeyFactory.cart(userId);
    const cart: RedisCart = {
      userId,
      items,
      updatedAt: new Date().toISOString()
    };
    await redis.set(key, JSON.stringify(cart), 'EX', CART_TTL_SECONDS);
    return cart;
  }

  /**
   * Clear the user's cart
   */
  async clearCart(userId: string) {
    const key = KeyFactory.cart(userId);
    await redis.del(key);
  }

  /**
   * Capture an abandoned cart for a guest (who hasn't completed OTP)
   */
  async captureAbandonedCart(name: string, phone: string, items: CartItemInput[]) {
    let user = await basePrisma.user.findUnique({ where: { phone } });
    if (user && user.deletedAt) {
      // Cannot capture abandoned cart for a deleted user
      return null;
    }
    if (!user) {
      user = await prisma.user.create({
        data: {
          name: name || 'Guest User',
          phone,
          isGuest: true,
          role: 'USER'
        }
      });
    }

    await this.syncCart(user.id, items);
    return { success: true, message: 'Cart captured successfully in Redis' };
  }

  /**
   * Get all abandoned carts for Admin viewing
   * Since it's an admin route, scanning Redis keys is acceptable performance-wise.
   */
  async getAbandonedCarts(isGuest?: string) {
    const keys = await redis.keys('femcart:cart:*');
    if (keys.length === 0) return [];

    const carts: any[] = [];
    for (const key of keys) {
      const data = await redis.get(key);
      if (data) {
        const cart = JSON.parse(data);
        carts.push(cart);
      }
    }

    const userIds = carts.map(c => c.userId);
    const users = await prisma.user.findMany({
      where: { 
        id: { in: userIds },
        role: 'USER',
        ...(isGuest !== undefined ? { isGuest: isGuest === 'true' } : {})
      },
      select: { id: true, name: true, email: true, phone: true, isGuest: true }
    });

    const userMap = new Map(users.map((u: any) => [u.id, u]));

    const formattedCarts = carts
      .filter(cart => userMap.has(cart.userId) && cart.items.length > 0)
      .map(cart => ({
        ...cart,
        user: userMap.get(cart.userId)
      }));

    return formattedCarts.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
  }
}
