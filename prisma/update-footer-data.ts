import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('🔄 Updating Femcart footer data...');

  // Update Global Settings
  const settingsToUpdate = [
    { key: 'footer_about_text', value: "Your trusted online destination for premium intimate apparel in Bangladesh. Comfort, confidence, and quality." },
    { key: 'footer_email', value: 'support@femcart.com' },
    { key: 'footer_address', value: 'Dhaka, Bangladesh' },
  ];

  for (const setting of settingsToUpdate) {
    await prisma.setting.upsert({
      where: { key: setting.key },
      update: { value: setting.value },
      create: { key: setting.key, value: setting.value },
    });
  }
  console.log('✅ Global Settings updated.');

  // Update "Halal Promise" link to something relevant for Femcart, like "Our Promise" or "Size Guide"
  const halalPromiseLink = await prisma.footerLink.findFirst({
    where: { title: "Halal Promise" }
  });

  if (halalPromiseLink) {
    await prisma.footerLink.update({
      where: { id: halalPromiseLink.id },
      data: { title: "Size Guide", url: "/size-guide" }
    });
    console.log('✅ Footer Link "Halal Promise" changed to "Size Guide".');
  }

  console.log('✅ Footer data successfully updated for Femcart!');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
