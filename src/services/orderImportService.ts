import prisma from '../config/database';
import { WCSetting, WCOrder } from './wordpressService';

export async function importOrder(
  wcOrder: WCOrder,
  setting: WCSetting,
  logFn?: (msg: string) => void
): Promise<'created' | 'updated' | 'skipped'> {
  const externalId = `wc_order_${wcOrder.id}`;
  logFn && logFn(`⬇️ Processing Order #${wcOrder.id}`);

  // ── Find or Create User ──
  let user = null;
  const email = wcOrder.billing?.email || null;
  const phone = wcOrder.billing?.phone || null;

  if (email) {
    user = await prisma.user.findFirst({ where: { email } });
  }
  if (!user && phone) {
    user = await prisma.user.findFirst({ where: { phone } });
  }

  if (!user) {
    // Auto-create user
    const customerName = (wcOrder.billing?.first_name || '') + ' ' + (wcOrder.billing?.last_name || '');
    const placeholderEmail = email || `customer_${wcOrder.id}@imported.local`;
    
    user = await prisma.user.create({
      data: {
        name: customerName.trim() || 'Unknown Customer',
        email: placeholderEmail,
        phone,
        isGuest: true,
        address: wcOrder.billing?.address_1,
        city: wcOrder.billing?.city,
      }
    });
    logFn && logFn(`  👤 Auto-created user ${user.id} for order.`);
  }

  // ── Status Mapping ──
  let status: any = 'PENDING';
  switch (wcOrder.status) {
    case 'processing': status = 'PROCESSING'; break;
    case 'completed': status = 'DELIVERED'; break;
    case 'cancelled': 
    case 'failed': status = 'CANCELLED'; break;
    case 'refunded': status = 'RETURNED'; break;
    case 'on-hold': status = 'PENDING'; break;
  }

  const paymentStatus = (wcOrder.status === 'completed' || wcOrder.status === 'processing') ? 'PAID' : 'UNPAID';

  let paymentMethod: any = 'COD';
  if (wcOrder.payment_method?.includes('stripe') || wcOrder.payment_method?.includes('card')) paymentMethod = 'CARD';
  else if (wcOrder.payment_method?.includes('paypal')) paymentMethod = 'PAYPAL';
  else if (wcOrder.payment_method?.includes('bkash')) paymentMethod = 'BKASH';
  else if (wcOrder.payment_method?.includes('nagad')) paymentMethod = 'NAGAD';

  const orderData = {
    externalId,
    externalSource: 'WOOCOMMERCE',
    userId: user.id,
    customerName: (wcOrder.billing?.first_name || '') + ' ' + (wcOrder.billing?.last_name || ''),
    customerPhone: wcOrder.billing?.phone || null,
    status,
    total: parseFloat(wcOrder.total || '0'),
    subtotal: parseFloat(wcOrder.total || '0') - parseFloat(wcOrder.shipping_total || '0'), 
    deliveryFee: parseFloat(wcOrder.shipping_total || '0'),
    discount: parseFloat(wcOrder.discount_total || '0'),
    deliveryAddress: wcOrder.shipping?.address_1 || wcOrder.billing?.address_1 || 'N/A',
    deliveryCity: wcOrder.shipping?.city || wcOrder.billing?.city,
    deliveryState: wcOrder.shipping?.state || wcOrder.billing?.state,
    paymentMethod,
    paymentStatus,
    createdAt: new Date(wcOrder.date_created),
    updatedAt: new Date(wcOrder.date_modified),
  };

  const existingOrder = await prisma.order.findUnique({ where: { externalId } });

  if (existingOrder) {
    await prisma.order.update({
      where: { id: existingOrder.id },
      data: orderData
    });
    logFn && logFn(`  🛠️ Updated order record.`);
    return 'updated';
  } else {
    const order = await prisma.order.create({
      data: orderData
    });
    logFn && logFn(`  ✨ Created order record.`);

    // ── Create Line Items ──
    for (const item of (wcOrder.line_items || [])) {
      // Find matching product
      let productId = null;
      let variantId = null;

      if (item.product_id) {
        const p = await prisma.product.findFirst({ where: { externalId: `wc_${item.product_id}` } });
        if (p) productId = p.id;
      }

      if (item.variation_id) {
        const v = await prisma.productVariant.findUnique({ where: { externalId: `wc_var_${item.variation_id}` } });
        if (v) variantId = v.id;
      }

      await prisma.orderItem.create({
        data: {
          orderId: order.id,
          productId,
          variantId,
          quantity: item.quantity,
          price: item.price || (parseFloat(item.subtotal) / item.quantity) || 0,
          externalId: `wc_orderitem_${item.id}`
        }
      });
    }

    return 'created';
  }
}
