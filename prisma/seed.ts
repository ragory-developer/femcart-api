import { PrismaClient } from '@prisma/client';
// @ts-ignore
import bcrypt from 'bcryptjs';
import fs from 'fs';
import path from 'path';
import { categories, brands, products } from './realistic-data';
import { generateUsers, generateAddresses, generateReviews, generateOrders } from './faker/generators';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Starting comprehensive database seeding for Femcart...');

  // --- Clean up existing data ---
  console.log('🧹 Cleaning up existing data...');

  await prisma.orderNote.deleteMany({});
  await prisma.orderItem.deleteMany({});
  await prisma.order.deleteMany({});
  await prisma.review.deleteMany({});
  await prisma.wishlist.deleteMany({});
  await prisma.variantAttribute.deleteMany({});
  await prisma.productVariant.deleteMany({});
  await prisma.product.deleteMany({});
  await prisma.category.deleteMany({});
  await prisma.brand.deleteMany({});
  await prisma.builderPageVersion.deleteMany({});
  await prisma.builderPage.deleteMany({});
  await prisma.builderTemplate.deleteMany({});
  await prisma.builderComponentContent.deleteMany({});
  await prisma.builderComponent.deleteMany({});
  await prisma.navbarItem.deleteMany({});
  await prisma.footerLink.deleteMany({});
  await prisma.footerSection.deleteMany({});
  await prisma.setting.deleteMany({});
  await prisma.userAddress.deleteMany({});
  await prisma.area.deleteMany({});
  await prisma.city.deleteMany({});
  await prisma.state.deleteMany({});
  await prisma.user.deleteMany({});

  console.log('✅ Clean up completed.');

  // --- Seed Users ---
  console.log('👤 Seeding users...');
  const hashedPassword = await bcrypt.hash('password123', 12);

  const superAdmin = await prisma.user.create({
    data: {
      email: 'admin@femcart.com',
      password: hashedPassword,
      name: 'Store Manager',
      phone: '3050000000',
      role: 'SUPER_ADMIN',
    },
  });

  const customer = await prisma.user.create({
    data: {
      email: 'customer@femcart.com',
      password: hashedPassword,
      name: 'Emma Stone',
      phone: '7860000000',
      role: 'USER',
    },
  });

  // --- Regions ---
  console.log('🗺️ Seeding locations...');
  const stateNY = await prisma.state.upsert({
    where: { name: 'New York' },
    update: {},
    create: { name: 'New York', status: 'active' },
  });

  const cityNY = await prisma.city.create({
    data: { name: 'New York City', stateId: stateNY.id, status: 'active' },
  });
  const cityBrooklyn = await prisma.city.create({
    data: { name: 'Brooklyn', stateId: stateNY.id, status: 'active' },
  });

  const areaManhattan = await prisma.area.create({
    data: { name: 'Manhattan', cityId: cityNY.id, status: 'active' },
  });

  // Seed Customer Address
  await prisma.userAddress.create({
    data: {
      userId: customer.id,
      label: 'Home',
      address: '123 Femcart Avenue, Apt 2B',
      city: 'New York City',
      area: 'Manhattan',
      state: 'New York',
      stateId: stateNY.id,
      cityId: cityNY.id,
      areaId: areaManhattan.id,
      isDefault: true,
      recipientName: 'Emma Stone',
      recipientPhone: '7860000000',
    },
  });

  // --- Use Pre-Generated Realistic Data ---
  console.log(`📊 Loaded ${products.length} unique products, ${brands.length} brands, and ${categories.length} categories.`);

  // --- Seed Brands ---
  console.log('🏷️ Seeding realistic brands...');
  const createdBrands: Record<string, string> = {};
  for (const b of brands) {
    const brand = await prisma.brand.create({ data: { name: b.name, slug: b.slug, logo: (b as any).logo || `https://placehold.co/400x200/EEE/31343C?font=montserrat&text=${encodeURIComponent(b.name)}` } });
    createdBrands[b.slug] = brand.id;
  }

  // --- Seed Categories ---
  console.log('🗂️ Seeding realistic categories...');
  const createdCats: Record<string, string> = {};
  
  // First pass: parent categories
  for (const cat of categories.filter((c: any) => !c.parent)) {
    const created = await prisma.category.create({ data: { name: cat.name, slug: cat.slug, image: (cat as any).image } });
    createdCats[cat.slug] = created.id;
  }
  
  for (const cat of categories.filter((c: any) => c.parent)) {
    const parentSlug = (cat as any).parent;
    if (createdCats[parentSlug]) {
      const created = await prisma.category.create({ 
        data: { name: (cat as any).name, slug: (cat as any).slug, image: (cat as any).image, parentId: createdCats[parentSlug] } 
      });
      createdCats[cat.slug] = created.id;
    }
  }

  // --- Seed Products & Variants ---
  console.log('🛍️ Seeding realistic products...');
  for (const p of products) {
    await prisma.product.create({
      data: {
        name: p.name,
        slug: p.slug,
        description: p.description,
        shortDescription: p.shortDescription,
        price: p.price,
        stock: p.stock,
        image: p.image,
        images: p.images,
        unit: p.unit,
        isHalal: p.isHalal,
        featured: p.featured,
        brandId: p.brandSlug ? createdBrands[p.brandSlug] : undefined,
        categories: p.categorySlug && createdCats[p.categorySlug] 
          ? { connect: [{ id: createdCats[p.categorySlug] }] } 
          : undefined,
      }
    });
  }
  console.log(`✅ Seeded ${products.length} products.`);

  // --- Seed Realistic Real-World Data (Users, Reviews, Orders) ---
  // --- Seed Realistic Real-World Data (Users, Reviews, Orders) ---
  console.log('👥 Generating fake users, addresses, and orders...');
  
  const fakeUsers = generateUsers(30);
  const createdUserIds: string[] = [];
  for (const u of fakeUsers) {
    const user = await prisma.user.create({ data: { ...u, password: hashedPassword } });
    createdUserIds.push(user.id);
  }

  console.log('🏠 Generating addresses for users...');
  const fakeAddresses = generateAddresses(createdUserIds, stateNY.id, cityNY.id, areaManhattan.id);
  const createdAddressIds: string[] = [];
  for (const addr of fakeAddresses) {
    const address = await prisma.userAddress.create({ data: addr });
    createdAddressIds.push(address.id);
  }

  const allProductIds = (await prisma.product.findMany({ select: { id: true } })).map((p: any) => p.id);

  console.log('⭐ Generating 100 realistic product reviews...');
  const fakeReviews = generateReviews(allProductIds, [customer.id, ...createdUserIds], 100);
  for (const rev of fakeReviews) {
    await prisma.review.create({ data: rev });
  }

  console.log('📦 Generating 50 realistic past orders...');
  const fakeOrders = generateOrders(createdUserIds, allProductIds, createdAddressIds, 50);
  for (const order of fakeOrders) {
    const { items, ...orderData } = order;
    await prisma.order.create({
      data: {
        ...orderData,
        items: {
          create: items,
        },
      },
    });
  }

  // --- Seed Global Store Settings ---
  console.log('⚙️ Seeding store settings...');
  const settingsData = [
    { key: 'store_name', value: 'Femcart' },
    { key: 'store_logo', value: '/assets/02.logo 24_x20_-1.png' },
    { key: 'footer_about_text', value: "South Florida's premier halal supermarket serving Bangladeshi, Indian, Pakistani, Middle Eastern and Muslim communities." },
    { key: 'footer_address', value: 'Suite 170, South Florida' },
    { key: 'footer_phone', value: '(555) 123-4567' },
    { key: 'footer_email', value: 'contact@cityhalalmarket.com' },
    { key: 'footer_copyright', value: '© 2026 Femcart. All rights reserved.' },
    { key: 'currency', value: '$' },
    { key: 'permalink_structure', value: 'flat' },
    { key: 'productCardVariant', value: 'classic' },
    { key: 'productCardRadius', value: '2xl' },
    { key: 'productCardShowBadge', value: 'true' },
    { key: 'productCardShowRating', value: 'true' },
    { key: 'productCardShowAddToCart', value: 'true' },
    { key: 'productCardBadgeStyle', value: 'pill' },
    { key: 'checkout_verification_method', value: 'phone' },
  ];

  for (const setting of settingsData) {
    await prisma.setting.upsert({
      where: { key: setting.key },
      update: { value: setting.value },
      create: { key: setting.key, value: setting.value },
    });
  }

  // --- Seed Navbar & Footer Navigation ---
  // (Nav items moved to the bottom of this seed script)

  const footerSec = await prisma.footerSection.create({
    data: { title: "Quick Links", sortOrder: 1 }
  });

  const footerLinks = [
    { title: "About Us", url: "/about", sortOrder: 1, sectionId: footerSec.id },
    { title: "Our Products", url: "/products", sortOrder: 2, sectionId: footerSec.id },
    { title: "Halal Promise", url: "/promise", sortOrder: 3, sectionId: footerSec.id },
    { title: "Contact", url: "/contact", sortOrder: 4, sectionId: footerSec.id },
  ];

  for (const link of footerLinks) {
    await prisma.footerLink.create({ data: link });
  }

  // --- Seed Page Builder Components & Pages ---
  const defaultComponents = [
    { name: 'HeroBanner', label: 'Hero Banner', category: 'Hero' },
    { name: 'PromoBadgeGrid', label: 'Feature Badges', category: 'Marketing' },
    { name: 'HotDealsSection', label: 'Countdown Deals', category: 'Commerce' },
    { name: 'ProductShowcase', label: 'Product Grid', category: 'Commerce' },
    { name: 'TestimonialSection', label: 'Customer Reviews', category: 'Content' },
    { name: 'TrustBar', label: 'Trust Bar', category: 'Marketing' },
    { name: 'WhyUsSection', label: 'Why Us Section', category: 'Content' },
    { name: 'PromoBanner', label: 'Promo Banner', category: 'Marketing' },
    { name: 'SpecialOffersBanner', label: 'Special Offers', category: 'Marketing' },
    { name: 'CategoryShowcase', label: 'Category Grid', category: 'Commerce' },
    { name: 'BrandShowcase', label: 'Brand Grid', category: 'Commerce' },
    { name: 'BentoBannerGrid', label: 'Bento Banner Grid', category: 'Hero' },
    { name: 'ThreeProductBanner', label: 'Three Product Banner', category: 'Marketing' },
    { name: 'FaqSection', label: 'FAQ Section', category: 'Content' },
    { name: 'NewsletterBanner', label: 'Newsletter Banner', category: 'Marketing' },
  ];

  for (const comp of defaultComponents) {
    await prisma.builderComponent.create({ data: comp });
  }

  async function seedBuilderPage(key: string, slug: string, title: string, sections: any[]) {
    const documentJson = { schemaVersion: 1, page: { key, slug, title }, sections };
    const page = await prisma.builderPage.upsert({
      where: { key },
      update: { slug, title, type: 'builder', status: 'published' },
      create: { key, slug, title, type: 'builder', status: 'published' }
    });
    const version = await prisma.builderPageVersion.upsert({
      where: { pageId_version: { pageId: page.id, version: 1 } },
      update: { status: 'published', document: documentJson, publishedAt: new Date() },
      create: { pageId: page.id, version: 1, status: 'published', document: documentJson, publishedAt: new Date() }
    });
    await prisma.builderPage.update({
      where: { id: page.id },
      data: { publishedVersionId: version.id }
    });
  }

  const homeSections = [
    {
      id: "hero_banner_home",
      type: "HeroBanner",
      variant: "default",
      props: {}
    },
    {
      id: "trust_bar_home",
      type: "TrustBar",
      variant: "default",
      props: {}
    },
    {
      id: "promo_banner_home",
      type: "PromoBanner",
      variant: "default",
      props: {}
    },
    {
      id: "promo_badges_home",
      type: "PromoBadgeGrid",
      variant: "default",
      props: {}
    },
    {
      id: "product_showcase_featured",
      type: "ProductShowcase",
      variant: "default",
      props: {
        eyebrow: "Our Best Sellers",
        title: "Featured Products.",
        subtitle: "",
        showCategoryFilter: false,
        textAlign: "left"
      }
    },
    {
      id: "product_showcase_meat",
      type: "ProductShowcase",
      variant: "default",
      props: {
        eyebrow: "The Core of Our Promise",
        title: "Halal Meat Spotlight.",
        subtitle: "Cut to Order. Free of Charge.",
        showCategoryFilter: false,
        textAlign: "left",
        builderClassName: "bg-[var(--color-off-white)] border-y border-[var(--color-card-border)]"
      }
    },
    {
      id: "why_us_home",
      type: "WhyUsSection",
      variant: "default",
      props: {}
    },
    {
      id: "three_product_banner_home",
      type: "ThreeProductBanner",
      variant: "default",
      props: {}
    },
    {
      id: "bento_banner_grid_home",
      type: "BentoBannerGrid",
      variant: "default",
      props: {}
    },
    {
      id: "faq_section_home",
      type: "FaqSection",
      variant: "default",
      props: {}
    },
    {
      id: "newsletter_banner_home",
      type: "NewsletterBanner",
      variant: "default",
      props: {}
    }
  ];
  await seedBuilderPage('home', '/', 'Home', homeSections);

  console.log('🧭 Seeding navigation items...');
  const topItems = [
    { title: 'Home', url: '/', position: 'top', sortOrder: 1 },
    { title: 'Store', url: '/products', position: 'top', sortOrder: 2 },
    { title: 'Category', url: '/categories', position: 'top', sortOrder: 3 },
    { title: 'About Us', url: '/about', position: 'top', sortOrder: 4 },
    { title: 'Contact Us', url: '/contact', position: 'top', sortOrder: 5 },
  ];

  await prisma.navbarItem.createMany({
    data: topItems
  });

  const bottomItems = [
    {
      title: 'Lingerie', url: '/categories/lingerie', position: 'bottom', sortOrder: 1,
      children: [
        { title: 'Bras', url: '/categories/bras', position: 'bottom', sortOrder: 1 },
        { title: 'Panties', url: '/categories/panties', position: 'bottom', sortOrder: 2 },
        { title: 'Lingerie Sets', url: '/categories/lingerie-sets', position: 'bottom', sortOrder: 3 },
      ]
    },
    {
      title: 'Shapewear', url: '/categories/shapewear', position: 'bottom', sortOrder: 2,
      children: [
        { title: 'Bodysuits', url: '/categories/bodysuits', position: 'bottom', sortOrder: 1 },
        { title: 'Waist Cinchers', url: '/categories/waist-cinchers', position: 'bottom', sortOrder: 2 },
        { title: 'Control Briefs', url: '/categories/control-briefs', position: 'bottom', sortOrder: 3 },
      ]
    },
    {
      title: 'Activewear', url: '/categories/activewear', position: 'bottom', sortOrder: 3,
      children: [
        { title: 'Sports Bras', url: '/categories/sports-bras', position: 'bottom', sortOrder: 1 },
        { title: 'Leggings', url: '/categories/leggings', position: 'bottom', sortOrder: 2 },
      ]
    },
    {
      title: 'Loungewear & Sleepwear', url: '/categories/loungewear', position: 'bottom', sortOrder: 4,
      children: [
        { title: 'Pajamas', url: '/categories/pajamas', position: 'bottom', sortOrder: 1 },
        { title: 'Robes', url: '/categories/robes', position: 'bottom', sortOrder: 2 },
        { title: 'Nightgowns', url: '/categories/nightgowns', position: 'bottom', sortOrder: 3 },
      ]
    },
    {
      title: 'Swimwear', url: '/categories/swimwear', position: 'bottom', sortOrder: 5,
      children: [
        { title: 'Bikinis', url: '/categories/bikinis', position: 'bottom', sortOrder: 1 },
        { title: 'One-Piece', url: '/categories/one-piece', position: 'bottom', sortOrder: 2 },
      ]
    }
  ];

  for (const item of bottomItems) {
    await prisma.navbarItem.create({
      data: {
        title: item.title,
        url: item.url,
        position: item.position,
        sortOrder: item.sortOrder,
        children: {
          create: item.children.map(child => ({
            title: child.title,
            url: child.url,
            position: child.position,
            sortOrder: child.sortOrder
          }))
        }
      }
    });
  }

  console.log('✅ DB Seeding completely successful for Femcart!');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
