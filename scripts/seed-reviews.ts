import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('Starting review seeding...');

  // 1. Get a test user (or create one)
  let user = await prisma.user.findFirst({ where: { role: 'USER' } });
  if (!user) {
    user = await prisma.user.create({
      data: {
        name: 'John Doe',
        email: 'john@example.com',
        password: 'hashed_password', // Mocked
        role: 'USER',
      },
    });
  }

  // 2. Get some products
  const products = await prisma.product.findMany({ take: 5 });
  if (products.length === 0) {
    console.error('No products found in the database. Please seed products first.');
    process.exit(1);
  }

  const testimonials = [
    {
      reviewer: 'Sarah Ahmed',
      content: 'Great products and fast delivery! The halal meat was exceptionally fresh. Highly recommend this store to everyone in the community.',
      rating: 5,
      avatar: 'https://i.pravatar.cc/150?u=sarah',
    },
    {
      reviewer: 'Tariq Rahman',
      content: 'I was amazed by the quality of the organic dates and the neat packaging. The customer service is also top-notch!',
      rating: 5,
      avatar: 'https://i.pravatar.cc/150?u=tariq',
    },
    {
      reviewer: 'Aisha M.',
      content: 'Best halal grocery store in town. Everything I ordered was fresh, properly sealed, and delivered on time.',
      rating: 5,
      avatar: 'https://i.pravatar.cc/150?u=aisha',
    },
    {
      reviewer: 'Omar Farooq',
      content: 'Finally a reliable place to get premium Wagyu! The cuts were perfect and the taste was incredible. Will definitely buy again.',
      rating: 5,
      avatar: 'https://i.pravatar.cc/150?u=omar',
    },
    {
      reviewer: 'Fatima H.',
      content: 'Very convenient and trustworthy. The prices are competitive and the quality of fresh produce is consistently great.',
      rating: 4,
      avatar: 'https://i.pravatar.cc/150?u=fatima',
    }
  ];

  for (let i = 0; i < testimonials.length; i++) {
    const testimonial = testimonials[i];
    const product = products[i % products.length];

    await prisma.review.create({
      data: {
        userId: user.id,
        productId: product.id,
        rating: testimonial.rating,
        content: testimonial.content,
        reviewer: testimonial.reviewer,
        reviewerEmail: user.email,
        isApproved: true,
        showInHome: true, // Marked to show on home page
      },
    });
  }

  console.log('Successfully seeded 5 featured home testimonials!');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
