import prisma from '../config/database';

export interface IntegrityCheckResults {
  summary: {
    totalIssues: number;
    hasErrors: boolean;
  };
  duplicateSlugs: {
    slug: string;
    count: number;
    productIds: string[];
  }[];
  orphanedProducts: {
    id: string;
    name: string;
    slug: string;
  }[];
  invalidCartItems: {
    id: string;
    cartId: string;
    productId: string | null;
    variantId: string | null;
    reason: string;
  }[];
  invalidOrderItems: {
    id: string;
    orderId: string;
    productId: string | null;
    variantId: string | null;
    reason: string;
  }[];
  brokenImports: {
    id: string;
    name: string;
    slug: string;
    externalId: string | null;
    reason: string;
  }[];
}

export class CatalogIntegrityService {
  /**
   * Run all database catalog integrity validation queries
   */
  public async checkIntegrity(): Promise<IntegrityCheckResults> {
    const duplicateSlugs: { slug: string; count: number; productIds: string[] }[] = [];
    const orphanedProducts: { id: string; name: string; slug: string }[] = [];
    const invalidCartItems: { id: string; cartId: string; productId: string | null; variantId: string | null; reason: string }[] = [];
    const invalidOrderItems: { id: string; orderId: string; productId: string | null; variantId: string | null; reason: string }[] = [];
    const brokenImports: { id: string; name: string; slug: string; externalId: string | null; reason: string }[] = [];

    // 1. Duplicate product slugs check
    const slugCounts = await prisma.product.groupBy({
      by: ['slug'],
      _count: {
        slug: true,
      },
      having: {
        slug: {
          _count: {
            gt: 1,
          },
        },
      },
    });

    for (const item of slugCounts) {
      const conflictingProducts = await prisma.product.findMany({
        where: { slug: item.slug },
        select: { id: true },
      });
      duplicateSlugs.push({
        slug: item.slug,
        count: item._count.slug,
        productIds: conflictingProducts.map((p: any) => p.id),
      });
    }

    // 2. Orphaned products check (products with no categories assigned)
    const products = await prisma.product.findMany({
      select: {
        id: true,
        name: true,
        slug: true,
        externalId: true,
        images: true,
        categories: {
          select: {
            id: true,
          },
        },
      },
    });

    for (const p of products) {
      // Orphaned check
      if (p.categories.length === 0) {
        orphanedProducts.push({
          id: p.id,
          name: p.name,
          slug: p.slug,
        });
      }

      // 5. Broken imports checks (e.g. invalid JSON in images)
      if (p.images) {
        try {
          const parsed = JSON.parse(p.images);
          if (!Array.isArray(parsed)) {
            brokenImports.push({
              id: p.id,
              name: p.name,
              slug: p.slug,
              externalId: p.externalId,
              reason: 'images field is not a valid JSON array',
            });
          }
        } catch (e) {
          brokenImports.push({
            id: p.id,
            name: p.name,
            slug: p.slug,
            externalId: p.externalId,
            reason: 'images field has invalid JSON syntax',
          });
        }
      }
    }

    // Cart items check removed since carts are in Redis

    // 4. Order items with missing products/variants references
    const orderItems = await prisma.orderItem.findMany({
      select: {
        id: true,
        orderId: true,
        productId: true,
        variantId: true,
        product: { select: { id: true } },
        variant: { select: { id: true } },
      },
    });

    for (const item of orderItems) {
      if (item.productId && !item.product) {
        invalidOrderItems.push({
          id: item.id,
          orderId: item.orderId,
          productId: item.productId,
          variantId: item.variantId,
          reason: 'Referenced product does not exist in the database',
        });
      } else if (item.variantId && !item.variant) {
        invalidOrderItems.push({
          id: item.id,
          orderId: item.orderId,
          productId: item.productId,
          variantId: item.variantId,
          reason: 'Referenced product variant does not exist in the database',
        });
      } else if (!item.productId && !item.variantId) {
        invalidOrderItems.push({
          id: item.id,
          orderId: item.orderId,
          productId: null,
          variantId: null,
          reason: 'Both productId and variantId are missing/null',
        });
      }
    }

    const totalIssues =
      duplicateSlugs.length +
      orphanedProducts.length +
      invalidCartItems.length +
      invalidOrderItems.length +
      brokenImports.length;

    return {
      summary: {
        totalIssues,
        hasErrors: totalIssues > 0,
      },
      duplicateSlugs,
      orphanedProducts,
      invalidCartItems,
      invalidOrderItems,
      brokenImports,
    };
  }
}

export const catalogIntegrityService = new CatalogIntegrityService();
