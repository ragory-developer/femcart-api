import crypto from 'crypto';
import prisma from '../config/database';
import { NotFoundError, ForbiddenError } from '../utils/errors';

export class ApiKeyService {
  /**
   * Registers a new Invi connection with a Single Consumer Key (x-consumer-key).
   */
  public async registerConnection(
    name: string,
    allowedDomain: string = '*',
    webhookUrl?: string,
    permissions: string = 'all'
  ) {
    // Standard industry consumer key format
    const consumerKey = `ck_live_${crypto.randomBytes(16).toString('hex')}`;
    const webhookSecret = webhookUrl ? `whsec_${crypto.randomBytes(20).toString('hex')}` : null;
    const cleanDomain = allowedDomain && allowedDomain.trim() !== '' ? allowedDomain.trim().toLowerCase() : '*';

    const apiKey = await prisma.apiKey.create({
      data: {
        name,
        allowedDomain: cleanDomain,
        authMode: 'SINGLE_KEY',
        consumerKey,
        webhookUrl: webhookUrl && webhookUrl.trim() !== '' ? webhookUrl.trim() : null,
        webhookSecret,
        status: 'ACTIVE',
        permissions: permissions || 'all'
      }
    });

    return {
      id: apiKey.id,
      name: apiKey.name,
      allowedDomain: apiKey.allowedDomain,
      authMode: 'SINGLE_KEY',
      consumerKey: apiKey.consumerKey,
      webhookUrl: apiKey.webhookUrl,
      webhookSecret: apiKey.webhookSecret,
      status: apiKey.status,
      permissions: apiKey.permissions,
      createdAt: apiKey.createdAt
    };
  }

  /**
   * Admin: List all Invi connections
   */
  public async listConnections() {
    return prisma.apiKey.findMany({
      select: {
        id: true,
        name: true,
        allowedDomain: true,
        authMode: true,
        consumerKey: true,
        webhookUrl: true,
        webhookSecret: true,
        status: true,
        permissions: true,
        lastUsedAt: true,
        createdAt: true,
        updatedAt: true
      },
      orderBy: {
        createdAt: 'desc'
      }
    });
  }

  /**
   * Admin: Instant Active <-> Inactive Toggle
   */
  public async toggleStatus(id: string) {
    const existing = await prisma.apiKey.findUnique({ where: { id } });
    if (!existing) throw new NotFoundError('POS Connection not found');
    if (existing.status === 'REVOKED') throw new ForbiddenError('Cannot toggle a revoked connection. It must be recreated.');

    const newStatus = existing.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE';

    const updated = await prisma.apiKey.update({
      where: { id },
      data: { status: newStatus },
      select: { id: true, name: true, status: true, updatedAt: true }
    });

    return {
      message: `POS Connection status changed to ${newStatus}`,
      data: updated
    };
  }

  /**
   * Admin: Approve connection
   */
  public async approveConnection(id: string) {
    const existing = await prisma.apiKey.findUnique({ where: { id } });
    if (!existing) throw new NotFoundError('POS Connection not found');

    const updated = await prisma.apiKey.update({
      where: { id },
      data: { status: 'ACTIVE' },
      select: { id: true, name: true, status: true }
    });
    return updated;
  }

  /**
   * Admin: Revoke connection (disables without deleting record)
   */
  public async revokeConnection(id: string) {
    const existing = await prisma.apiKey.findUnique({ where: { id } });
    if (!existing) throw new NotFoundError('POS Connection not found');

    await prisma.apiKey.update({
      where: { id },
      data: { status: 'REVOKED' }
    });

    return { message: 'POS Connection revoked successfully' };
  }

  /**
   * Admin: Permanently delete a connection
   */
  public async deleteConnection(id: string) {
    const existing = await prisma.apiKey.findUnique({ where: { id } });
    if (!existing) throw new NotFoundError('POS Connection not found');

    await prisma.apiKey.delete({ where: { id } });
    return { message: 'POS Connection permanently deleted' };
  }

  /**
   * Admin: View live inventory audit ledger logs
   */
  public async getInventoryLogs(params: {
    page?: number;
    limit?: number;
    search?: string;
    source?: string;
  }) {
    const page = Number(params.page) || 1;
    const limit = Math.min(Number(params.limit) || 50, 100);
    const skip = (page - 1) * limit;

    const whereClause: any = {};

    if (params.search && params.search.trim() !== '') {
      whereClause.OR = [
        { sku: { contains: params.search.trim(), mode: 'insensitive' } },
        { reason: { contains: params.search.trim(), mode: 'insensitive' } },
        { referenceId: { contains: params.search.trim(), mode: 'insensitive' } },
        { product: { name: { contains: params.search.trim(), mode: 'insensitive' } } }
      ];
    }

    if (params.source && params.source.trim() !== '' && params.source !== 'ALL') {
      whereClause.source = params.source.trim();
    }

    const [logs, total] = await Promise.all([
      prisma.inventoryLog.findMany({
        where: whereClause,
        skip,
        take: limit,
        include: {
          product: {
            select: { id: true, name: true, sku: true, image: true }
          },
          variant: {
            select: { id: true, sku: true, price: true }
          }
        },
        orderBy: { createdAt: 'desc' }
      }),
      prisma.inventoryLog.count({ where: whereClause })
    ]);

    return {
      data: logs,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit)
      }
    };
  }
}

export const apiKeyService = new ApiKeyService();
