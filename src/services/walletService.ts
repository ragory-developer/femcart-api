import prisma from '../config/database';

export class WalletService {
  /**
   * Adjusts the global wallet balance
   * @param amount The amount to adjust (can be positive for top-ups or negative for deductions)
   * @param type 'TOPUP' | 'DEDUCTION' | 'REFUND'
   * @param note Note for the transaction
   * @param userId The ID of the admin who initiated it (optional)
   * @param tx Optional prisma transaction client
   */
  static async adjustGlobalBalance(amount: number, type: 'TOPUP' | 'DEDUCTION' | 'REFUND', note: string, userId?: string, tx?: any) {
    try {
      const executeOperation = async (prismaClient: any) => {
        // 1. Fetch current global balance with ROW LOCK
        const rawResult: any = await prismaClient.$queryRaw`SELECT value FROM setting WHERE \`key\` = 'wallet_balance' FOR UPDATE`;
        const currentBalance = (rawResult && rawResult.length > 0) ? parseFloat(rawResult[0].value) : 0;
        
        // 2. Calculate new balance
        const newBalance = currentBalance + amount;
        
        // 2.5 Prevent negative balance
        if (newBalance < 0) {
          throw new Error(`Insufficient wallet balance. Cannot deduct ${Math.abs(amount)}, only ${currentBalance} available.`);
        }
        
        // 3. Update or create setting
        await prismaClient.setting.upsert({
          where: { key: 'wallet_balance' },
          update: { value: newBalance.toString() },
          create: { key: 'wallet_balance', value: newBalance.toString() },
        });

        // 4. Create transaction log
        const loggedAmount = Math.abs(amount);
        const data: any = {
          amount: loggedAmount,
          type,
          note,
          status: 'COMPLETED',
        };
        if (userId) data.userId = userId;

        const transaction = await prismaClient.walletTransaction.create({ data });
        console.log(`[Wallet] Transaction log created: ${transaction.id} (${type}: ${loggedAmount})`);

        return { balance: newBalance, transaction };
      };

      if (tx) {
        return await executeOperation(tx);
      } else {
        return await prisma.$transaction(async (newTx: any) => {
          return await executeOperation(newTx);
        });
      }
    } catch (error: any) {
      console.error(`[Wallet] Failed to adjust global balance: ${error.message}`);
      throw error;
    }
  }

  /**
   * Retrieves the current global wallet balance
   */
  static async getGlobalBalance(): Promise<number> {
    const balanceSetting = await prisma.setting.findUnique({ where: { key: 'wallet_balance' } });
    return balanceSetting ? parseFloat(balanceSetting.value) : 0;
  }

  /**
   * Retrieves the last 100 wallet transactions
   */
  static async getTransactions() {
    return await prisma.walletTransaction.findMany({
      take: 100,
      orderBy: { createdAt: 'desc' },
      include: {
        user: {
          select: { name: true, email: true }
        }
      }
    });
  }
}
