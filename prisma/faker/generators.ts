import { faker } from '@faker-js/faker';

export function generateUsers(count: number) {
  const users = [];
  for (let i = 0; i < count; i++) {
    users.push({
      email: faker.internet.email(),
      name: faker.person.fullName(),
      phone: faker.phone.number(),
      isGuest: false,
      role: 'USER' as any,
      address: faker.location.streetAddress(),
      city: faker.location.city(),
      area: faker.location.county(),
      gender: faker.helpers.arrayElement(['male', 'female', 'other']),
      rewardPoints: faker.number.int({ min: 0, max: 1000 }),
    });
  }
  return users;
}

export function generateAddresses(userIds: string[], stateId: string, cityId: string, areaId: string) {
  const addresses = [];
  for (const userId of userIds) {
    addresses.push({
      userId,
      label: faker.helpers.arrayElement(['Home', 'Work', 'Other']),
      address: faker.location.streetAddress(),
      city: 'Miami',
      area: 'Miami Gardens',
      state: 'Florida',
      stateId,
      cityId,
      areaId,
      isDefault: true,
      recipientName: faker.person.fullName(),
      recipientPhone: faker.phone.number(),
    });
  }
  return addresses;
}

export function generateReviews(productIds: string[], userIds: string[], count: number) {
  const reviews = [];
  for (let i = 0; i < count; i++) {
    reviews.push({
      productId: faker.helpers.arrayElement(productIds),
      userId: faker.helpers.arrayElement(userIds),
      rating: faker.number.int({ min: 1, max: 5 }),
      content: faker.lorem.paragraph(),
      isApproved: true,
      showInHome: faker.datatype.boolean(),
      reviewer: faker.person.fullName(),
    });
  }
  return reviews;
}

export function generateOrders(userIds: string[], productIds: string[], addressIds: string[], count: number) {
  const orders = [];
  for (let i = 0; i < count; i++) {
    const numItems = faker.number.int({ min: 1, max: 5 });
    const items = [];
    let subtotal = 0;
    
    for (let j = 0; j < numItems; j++) {
      const price = parseFloat(faker.commerce.price());
      const quantity = faker.number.int({ min: 1, max: 3 });
      subtotal += price * quantity;
      
      items.push({
        productId: faker.helpers.arrayElement(productIds),
        quantity,
        price,
      });
    }

    const deliveryFee = 5.00;
    const total = subtotal + deliveryFee;

    orders.push({
      userId: faker.helpers.arrayElement(userIds),
      customerName: faker.person.fullName(),
      customerPhone: faker.phone.number(),
      status: faker.helpers.arrayElement(['PENDING', 'PROCESSING', 'SHIPPED', 'DELIVERED']),
      total,
      subtotal,
      deliveryFee,
      deliveryAddress: faker.location.streetAddress(),
      deliveryCity: 'Miami',
      deliveryArea: 'Miami Gardens',
      deliveryState: 'Florida',
      items, 
    });
  }
  return orders;
}
