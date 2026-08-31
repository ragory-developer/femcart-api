import prisma from '../src/config/database';

async function seedInviKey() {
  const consumerKey = process.env.INVI_KEY || 'ck_live_764936382785ab42bca6dfdf6f993712';
  
  console.log(`Checking Invi POS API Key: ${consumerKey}...`);

  const existing = await prisma.apiKey.findUnique({
    where: { consumerKey }
  });

  if (existing) {
    if (existing.status !== 'ACTIVE') {
      await prisma.apiKey.update({
        where: { id: existing.id },
        data: { status: 'ACTIVE' }
      });
      console.log(`Updated existing Invi POS API key to ACTIVE: ${existing.id}`);
    } else {
      console.log(`Invi POS API key already exists and is ACTIVE: ${existing.id}`);
    }
  } else {
    const created = await prisma.apiKey.create({
      data: {
        name: 'Invi POS Main Terminal',
        consumerKey,
        consumerSecret: 'cs_live_femcart_invi_pos_2026',
        status: 'ACTIVE',
        allowedDomain: '*',
        authMode: 'SINGLE_KEY',
        permissions: 'all'
      }
    });
    console.log(`Created new Invi POS API key: ${created.id}`);
  }

  // Ensure a product with SKU exists for POS testing
  let product = await prisma.product.findFirst({ where: { sku: 'FEM-INVI-001' } });
  if (!product) {
    // Check if any product exists to assign SKU
    const anyProduct = await prisma.product.findFirst();
    if (anyProduct) {
      product = await prisma.product.update({
        where: { id: anyProduct.id },
        data: { sku: 'FEM-INVI-001', stock: 100 }
      });
      console.log(`Assigned SKU 'FEM-INVI-001' to product: ${product.id}`);
    } else {
      product = await prisma.product.create({
        data: {
          name: 'Silk Lace Bralette (Invi POS Sample)',
          slug: 'silk-lace-bralette-invi-sample',
          sku: 'FEM-INVI-001',
          price: 1850,
          comparePrice: 2200,
          stock: 100,
          images: '[]',
          description: 'Sample test product for Invi POS integration'
        }
      });
      console.log(`Created sample product with SKU 'FEM-INVI-001': ${product.id}`);
    }
  } else {
    console.log(`Sample product with SKU 'FEM-INVI-001' ready: ${product.id}`);
  }

  // Ensure a test user exists
  let user = await prisma.user.findFirst();
  if (!user) {
    user = await prisma.user.create({
      data: {
        name: 'POS Test Customer',
        phone: '01700000000',
        email: 'pos.test@femcart.com',
        role: 'USER'
      }
    });
    console.log(`Created test user for orders: ${user.id}`);
  }

  // Ensure a test order exists for POS testing
  const orderCount = await prisma.order.count();
  if (orderCount === 0) {
    const order = await prisma.order.create({
      data: {
        userId: user.id,
        customerName: 'POS Test Customer',
        customerPhone: '01700000000',
        deliveryAddress: 'Gulshan 2, Dhaka, Bangladesh',
        status: 'PENDING',
        total: 1850,
        subtotal: 1850,
        deliveryFee: 60,
        items: {
          create: [
            {
              productId: product.id,
              quantity: 1,
              price: 1850
            }
          ]
        }
      }
    });
    console.log(`Created test order for POS order lifecycle verification: ${order.id}`);
  } else {
    console.log(`Orders already present in database (${orderCount} orders)`);
  }
}

seedInviKey()
  .catch((err) => {
    console.error('Error seeding Invi POS data:', err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
