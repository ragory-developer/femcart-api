import prisma from '../config/database';

export class UserService {
  /** Admin: get all customers (users who have at least 1 order) */
  async getCustomers() {
    const users = await prisma.user.findMany({
      where: { 
        role: 'USER',
        orders: { some: {} }
      },
      select: { 
        id: true, email: true, name: true, phone: true, role: true, isGuest: true, createdAt: true, rewardPoints: true,
        orders: { select: { total: true, deliveryArea: true, deliveryCity: true }, orderBy: { createdAt: 'desc' } },
        addresses: { 
          select: { area: true, city: true, isDefault: true }, 
          orderBy: [{ isDefault: 'desc' }, { createdAt: 'desc' }],
          take: 1 
        }
      },
      orderBy: { createdAt: 'desc' },
    });

    const enrichedUsers = users.map((u: any) => {
      const { orders, addresses, ...rest } = u;
      const bestAddress = addresses[0];
      const latestOrder = orders[0];
      
      const area = bestAddress?.area || latestOrder?.deliveryArea || null;
      const city = bestAddress?.city || latestOrder?.deliveryCity || null;

      return {
        ...rest,
        area,
        city,
        totalOrderAmount: orders.reduce((sum: any, o: any) => sum + o.total, 0),
        totalOrderCount: orders.length
      };
    });

    return enrichedUsers;
  }
}
