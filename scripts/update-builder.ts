import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function checkComponents() {
  const version = await prisma.builderPageVersion.findFirst({
    where: { page: { key: 'home' } },
    orderBy: { version: 'desc' }
  });
  
  if (version) {
    let doc: any = version.document;
    if (doc && doc.sections) {
      console.log('Available sections:', doc.sections.map((s: any) => s.type).join(', '));
      
      const originalCount = doc.sections.length;
      doc.sections = doc.sections.filter((s: any) => 
        s.type !== 'CategoryShowcase' && s.type !== 'BrandShowcase' &&
        s.id !== 'category_showcase_home' && s.id !== 'brand_showcase_home'
      );
      
      await prisma.builderPageVersion.update({
        where: { id: version.id },
        data: { document: doc }
      });
      console.log(`Successfully removed components. Sections count: ${originalCount} -> ${doc.sections.length}`);
    }
  }
}

checkComponents().finally(() => prisma.$disconnect());
