import { PrismaClient } from '@prisma/client';
import { stripeService } from '../src/services/stripeService';
import { paypalService } from '../src/services/paypalService';
import { bkashService } from '../src/services/bkashService';
import { sslcommerzService } from '../src/services/sslcommerzService';
import { nagadService } from '../src/services/nagadService';

const prisma = new PrismaClient();

async function testGateways() {
  console.log("=== Testing Payment Gateways ===\n");
  const orderId = "TEST_ORDER_" + Date.now();
  const amountBDT = 1200;
  const amountUSD = 10;
  
  // 1. Stripe
  try {
    const session = await stripeService.createCheckoutSession(orderId, amountUSD, 'usd');
    console.log("✅ STRIPE: Working! URL:", session.url?.substring(0, 50) + "...");
  } catch (e: any) {
    console.log("❌ STRIPE ERROR:", e.message);
  }

  // 2. PayPal
  try {
    const paypalOrder = await paypalService.createOrder(orderId, amountUSD);
    console.log("✅ PAYPAL: Working! Order ID:", paypalOrder.id);
  } catch (e: any) {
    console.log("❌ PAYPAL ERROR:", e.message);
  }

  // 3. SSL Commerz
  try {
    const session = await sslcommerzService.initPayment(orderId, amountBDT, 'BDT', {
      name: "Test User",
      phone: "01700000000",
      address: "Dhaka",
      city: "Dhaka",
    });
    console.log("✅ SSL COMMERZ: Working! URL:", session.url?.substring(0, 50) + "...");
  } catch (e: any) {
    console.log("❌ SSL COMMERZ ERROR:", e.message);
  }

  // 4. bKash
  try {
    const session = await bkashService.createPayment(orderId, amountBDT);
    console.log("✅ bKash: Working! URL:", session.url?.substring(0, 50) + "...");
  } catch (e: any) {
    console.log("❌ bKash ERROR:", e.message);
  }

  // 5. Nagad
  try {
    const session = await nagadService.initPayment(orderId, amountBDT);
    console.log("✅ Nagad: Working! URL:", session.url?.substring(0, 50) + "...");
  } catch (e: any) {
    console.log("❌ Nagad ERROR:", e.message);
  }

  console.log("\n=== Testing Complete ===");
  await prisma.$disconnect();
}

testGateways();
