const fs = require('fs');
let c = fs.readFileSync('prisma/schema.prisma', 'utf8');
const searchString = 'model NewsletterSubscriber';
const index = c.indexOf(searchString);
if (index !== -1) {
    const start = c.substring(0, index);
    const end = `model NewsletterSubscriber {
  id        String   @id @default(cuid())
  email     String   @unique
  status    String   @default("SUBSCRIBED") // SUBSCRIBED, UNSUBSCRIBED
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
}

model ShopifySetting {
  id              String   @id @default(cuid())
  shopUrl         String
  accessToken     String   @db.Text
  apiVersion      String   @default("2024-01")
  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt
  
  @@map("shopify_setting")
}
`;
    fs.writeFileSync('prisma/schema.prisma', start + end);
}
