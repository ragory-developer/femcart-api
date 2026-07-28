const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const globalSections = [
    {
      id: "global_header_1",
      type: "GlobalHeader",
      variant: "alpha",
      props: {}
    },
    {
      id: "global_footer_1",
      type: "GlobalFooter",
      variant: "alpha",
      props: {}
    }
  ];

  const documentJson = { schemaVersion: 1, page: { key: 'global', slug: 'global', title: 'Global Layout', theme: 'template-alpha' }, sections: globalSections };

  const page = await prisma.builderPage.upsert({
    where: { key: 'global' },
    update: { slug: 'global', title: 'Global Layout', type: 'builder', status: 'published' },
    create: { key: 'global', slug: 'global', title: 'Global Layout', type: 'builder', status: 'published' }
  });

  const version = await prisma.builderPageVersion.upsert({
    where: { pageId_version: { pageId: page.id, version: 1 } },
    update: { status: 'published', document: documentJson, publishedAt: new Date() },
    create: { pageId: page.id, version: 1, status: 'published', document: documentJson, publishedAt: new Date() }
  });

  await prisma.builderPage.update({
    where: { id: page.id },
    data: { publishedVersionId: version.id, draft: documentJson }
  });

  console.log("Global page seeded successfully!");
}

main().catch(console.error).finally(() => prisma.$disconnect());
