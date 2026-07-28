const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function seed() {
  const templates = [
    {
      key: 'template-alpha-base',
      name: 'Standard Alpha',
      scope: 'page',
      pageType: 'home',
      themeKey: 'template-alpha',
      isSystem: true,
      document: {
        page: { key: "home", title: "Standard Alpha", slug: "/", theme: "template-alpha" },
        sections: [
          {
            id: "hero-alpha-1",
            type: "HeroBannerAlpha",
            props: {},
            styles: { padding: "default" }
          },
          {
            id: "trust-alpha-1",
            type: "TrustBarAlpha",
            props: {},
            styles: { padding: "default" }
          },
          {
            id: "products-alpha-1",
            type: "ProductOverviewSectionAlpha",
            props: { title: "Featured Products", limit: 8 },
            styles: { padding: "default" }
          },
          {
            id: "brands-alpha-1",
            type: "BrandShowcaseAlpha",
            props: { title: "Our Trusted Brands", limit: 12 },
            styles: { padding: "default" }
          },
          {
            id: "testimonials-alpha-1",
            type: "TestimonialSectionAlpha",
            props: { title: "What Our Customers Say" },
            styles: { padding: "default" }
          },
          {
            id: "newsletter-alpha-1",
            type: "NewsletterBannerAlpha",
            props: { title: "Subscribe to Our Newsletter", subtitle: "Get the latest updates and offers." },
            styles: { padding: "default" }
          }
        ]
      }
    },
    {
      key: 'template-beta-base',
      name: 'Standard Beta',
      scope: 'page',
      pageType: 'home',
      themeKey: 'template-beta',
      isSystem: true,
      document: {
        page: { key: "home", title: "Standard Beta", slug: "/", theme: "template-beta" },
        sections: [
          {
            id: "hero-beta-1",
            type: "HeroBannerBeta",
            props: {},
            styles: { padding: "default" }
          }
        ]
      }
    },
    {
      key: 'template-gamma-base',
      name: 'Standard Gamma',
      scope: 'page',
      pageType: 'home',
      themeKey: 'template-gamma',
      isSystem: true,
      document: {
        page: { key: "home", title: "Gamma Home", slug: "/", theme: "template-gamma" },
        sections: [
          {
            id: "hero-gamma-1",
            type: "HeroBannerGamma",
            props: {},
            styles: { padding: "default" }
          }
        ]
      }
    }
  ];

  for (const t of templates) {
    const existing = await prisma.builderTemplate.findUnique({
      where: { key: t.key }
    });
    
    if (existing) {
      await prisma.builderTemplate.update({
        where: { key: t.key },
        data: t
      });
      console.log(`Updated ${t.name}`);
    } else {
      await prisma.builderTemplate.create({
        data: t
      });
      console.log(`Created ${t.name}`);
    }
  }
}

seed().catch(console.error).finally(() => prisma.$disconnect());
