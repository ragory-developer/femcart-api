import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ProductController } from '../controllers/ProductController';

// Mock database connection
vi.mock('../config/database', () => {
  const mockPrisma = {
    product: {
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      create: vi.fn(),
    },
  };
  return {
    default: mockPrisma,
  };
});

vi.mock('../core/redis/CacheService', () => {
  return {
    CacheService: {
      get: vi.fn(),
      set: vi.fn(),
      del: vi.fn(),
      incr: vi.fn(),
      setHash: vi.fn(),
      getHash: vi.fn(),
    },
  };
});

vi.mock('../core/redis/KeyFactory', () => {
  return {
    KeyFactory: {
      productCacheVersion: vi.fn().mockReturnValue('product_cache_version'),
      productList: vi.fn().mockReturnValue('product_list'),
    },
  };
});

// Import prisma directly from the mocked module for assertions
import prisma from '../config/database';

// Mock asyncHandler helper to bypass Express wrapper
vi.mock('../utils/helpers', async (importOriginal) => {
  const actual = await importOriginal<any>();
  return {
    ...actual,
    asyncHandler: (fn: any) => fn,
  };
});

describe('ProductController - Create Product', () => {
  let controller: ProductController;

  beforeEach(() => {
    vi.clearAllMocks();
    controller = new ProductController();
  });

  it('should successfully create a simple product and auto-generate slug if not provided', async () => {
    const req: any = {
      body: {
        name: 'Fresh Apples',
        price: 4.99,
        stock: 50,
        images: ['apple1.jpg'],
        categoryIds: ['cat-123'],
      },
    };
    const res: any = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn(),
    };
    const next: any = vi.fn();

    // Mock findUnique to return null (meaning slug is available)
    (prisma.product.findUnique as any).mockResolvedValue(null);
    const createdProduct = {
      id: 'prod-123',
      name: 'Fresh Apples',
      slug: 'fresh-apples',
      price: 4.99,
      stock: 50,
    };
    (prisma.product.create as any).mockResolvedValue(createdProduct);

    await controller.create(req, res, next);

    expect(prisma.product.findUnique).toHaveBeenCalledWith({ where: { slug: 'fresh-apples' } });
    expect(prisma.product.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        name: 'Fresh Apples',
        slug: 'fresh-apples',
        productType: 'SIMPLE',
        price: 4.99,
        stock: 50,
        categories: { connect: [{ id: 'cat-123' }] },
      }),
      include: {
        categories: true,
        brand: true,
        variants: { include: { attributes: true } },
      },
    });
    expect(res.status).toHaveBeenCalledWith(201);
    expect(res.json).toHaveBeenCalledWith({ success: true, data: createdProduct });
  });

  it('should return 400 if custom slug is already taken', async () => {
    const req: any = {
      body: {
        name: 'Fresh Apples',
        slug: 'custom-apple-slug',
        price: 4.99,
      },
    };
    const res: any = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn(),
    };
    const next: any = vi.fn();

    // Mock findUnique to return an existing product (slug is taken)
    (prisma.product.findUnique as any).mockResolvedValue({ id: 'existing-id', slug: 'custom-apple-slug' });

    await controller.create(req, res, next);

    expect(prisma.product.findUnique).toHaveBeenCalledWith({ where: { slug: 'custom-apple-slug' } });
    expect(prisma.product.create).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      message: 'The custom slug is already taken. Please choose another one.',
    });
  });

  it('should successfully create a variable product with variants', async () => {
    const req: any = {
      body: {
        name: 'T-Shirt',
        price: 19.99,
        categoryIds: ['cat-123'],
        variants: [
          {
            sku: 'TSHIRT-RED-L',
            price: 21.99,
            isDefault: true,
            enabled: true,
            attributes: [
              { name: 'Color', value: 'Red' },
              { name: 'Size', value: 'L' },
            ],
          },
        ],
      },
    };
    const res: any = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn(),
    };
    const next: any = vi.fn();

    (prisma.product.findUnique as any).mockResolvedValue(null);
    const createdProduct = {
      id: 'prod-456',
      name: 'T-Shirt',
      slug: 't-shirt',
      productType: 'VARIABLE',
    };
    (prisma.product.create as any).mockResolvedValue(createdProduct);

    await controller.create(req, res, next);

    expect(prisma.product.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        name: 'T-Shirt',
        productType: 'VARIABLE',
        variants: {
          create: [
            expect.objectContaining({
              sku: 'TSHIRT-RED-L',
              price: 21.99,
              isDefault: true,
              enabled: true,
              attributes: {
                create: [
                  { name: 'Color', value: 'Red' },
                  { name: 'Size', value: 'L' },
                ],
              },
            }),
          ],
        },
      }),
      include: {
        categories: true,
        brand: true,
        variants: { include: { attributes: true } },
      },
    });
    expect(res.status).toHaveBeenCalledWith(201);
  });
});
