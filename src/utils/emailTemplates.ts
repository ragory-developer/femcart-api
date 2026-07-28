import { sendEmail } from './email';

export const sendOrderConfirmationEmail = async (order: any, customerEmail: string) => {
  if (!customerEmail) {
    console.warn(`[Email] Skipped sending confirmation for order ${order.id} because no email was provided.`);
    return false;
  }

  const itemsHtml = order.items.map((item: any) => {
    const itemName = item.product?.name || item.variant?.product?.name || 'Unknown Product';
    return `
      <tr>
        <td style="padding: 10px; border-bottom: 1px solid #eeeeee;">${itemName}</td>
        <td style="padding: 10px; border-bottom: 1px solid #eeeeee; text-align: center;">${item.quantity}</td>
        <td style="padding: 10px; border-bottom: 1px solid #eeeeee; text-align: right;">৳${item.price.toFixed(2)}</td>
      </tr>
    `;
  }).join('');

  let title = 'Order Confirmation Receipt';
  let message = `Thank you for shopping with us! We have received your order <strong>#${order.id.slice(-6).toUpperCase()}</strong>.`;
  let subject = `Order Confirmation #${order.id.slice(-6).toUpperCase()} - City Halal Mart`;

  if (order.paymentStatus === 'PAID' || order.status === 'COMPLETED' || order.status === 'DELIVERED') {
    title = 'Order Confirmation (Paid)';
    subject = `Order Confirmation (Paid) #${order.id.slice(-6).toUpperCase()} - City Halal Mart`;
  } else if (order.paymentMethod === 'COD') {
    title = 'Order Received (Cash on Delivery)';
    subject = `Order Received (COD) #${order.id.slice(-6).toUpperCase()} - City Halal Mart`;
  } else {
    title = 'Order Received (Payment Pending)';
    subject = `Action Required: Payment Pending #${order.id.slice(-6).toUpperCase()} - City Halal Mart`;
    message = `We have received your order <strong>#${order.id.slice(-6).toUpperCase()}</strong>. Please note that your order is awaiting payment. If you haven't completed the payment yet, you can do so from your dashboard.`;
  }

  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #eaeaea; border-radius: 8px;">
      <div style="text-align: center; margin-bottom: 30px;">
        <h1 style="color: #E60012; margin: 0;">City Halal Mart</h1>
        <p style="color: #666; font-size: 14px;">${title}</p>
      </div>

      <div style="margin-bottom: 30px;">
        <h2 style="font-size: 18px; color: #333; margin-bottom: 5px;">Hello ${order.customerName || 'Customer'},</h2>
        <p style="color: #555; line-height: 1.5; margin-top: 0;">
          ${message}
        </p>
      </div>

      <div style="margin-bottom: 30px; background-color: #f9f9f9; padding: 15px; border-radius: 6px;">
        <h3 style="font-size: 16px; margin-top: 0; margin-bottom: 15px; color: #333;">Order Details</h3>
        <table style="width: 100%; border-collapse: collapse; font-size: 14px;">
          <thead>
            <tr>
              <th style="padding: 10px; border-bottom: 2px solid #ddd; text-align: left;">Item</th>
              <th style="padding: 10px; border-bottom: 2px solid #ddd; text-align: center;">Qty</th>
              <th style="padding: 10px; border-bottom: 2px solid #ddd; text-align: right;">Price</th>
            </tr>
          </thead>
          <tbody>
            ${itemsHtml}
          </tbody>
          <tfoot>
            <tr>
              <td colspan="2" style="padding: 10px; text-align: right; color: #666;">Subtotal</td>
              <td style="padding: 10px; text-align: right;">৳${order.subtotal.toFixed(2)}</td>
            </tr>
            <tr>
              <td colspan="2" style="padding: 10px; text-align: right; color: #666;">Delivery Fee</td>
              <td style="padding: 10px; text-align: right;">৳${order.deliveryFee.toFixed(2)}</td>
            </tr>
            ${order.discount > 0 ? `
            <tr>
              <td colspan="2" style="padding: 10px; text-align: right; color: #E60012;">Discount</td>
              <td style="padding: 10px; text-align: right; color: #E60012;">-৳${order.discount.toFixed(2)}</td>
            </tr>
            ` : ''}
            <tr>
              <td colspan="2" style="padding: 15px 10px; text-align: right; font-weight: bold; font-size: 16px; border-top: 2px solid #ddd;">Total</td>
              <td style="padding: 15px 10px; text-align: right; font-weight: bold; font-size: 16px; border-top: 2px solid #ddd;">৳${order.total.toFixed(2)}</td>
            </tr>
          </tfoot>
        </table>
      </div>

      <div style="margin-bottom: 20px;">
        <h3 style="font-size: 16px; color: #333; margin-bottom: 10px;">Delivery Address</h3>
        <p style="color: #555; line-height: 1.5; margin: 0;">
          ${order.deliveryAddress}<br/>
          ${order.deliveryArea ? order.deliveryArea + ', ' : ''}${order.deliveryCity || ''}
        </p>
      </div>

      <div style="text-align: center; margin-top: 40px; padding-top: 20px; border-top: 1px solid #eaeaea;">
        <p style="color: #888; font-size: 12px;">If you have any questions, please contact our support team.</p>
        <p style="color: #888; font-size: 12px;">&copy; ${new Date().getFullYear()} City Halal Mart. All rights reserved.</p>
      </div>
    </div>
  `;

  return sendEmail({
    to: customerEmail,
    subject: subject,
    html: html
  });
};

