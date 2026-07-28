import { z } from 'zod';

export const createProductSchema = z.object({
  name: z.string().min(2, 'Name must be at least 2 characters'),
  description: z.string().optional().nullable(),
  shortDescription: z.string().optional().nullable(),
  price: z.number().min(0, 'Price must be non-negative').or(z.string().transform(v => Number(v))),
  specialPrice: z.number().min(0).nullable().optional().or(z.string().optional().transform(v => v ? Number(v) : null)),
  specialPriceStart: z.string().nullable().optional(),
  specialPriceEnd: z.string().nullable().optional(),
  stock: z.number().min(0).optional().default(0).or(z.string().transform(v => Number(v))),
  image: z.string().optional().nullable(),
  images: z.union([z.string(), z.array(z.string())]).optional(),
  unit: z.string().optional(),
  weight: z.string().optional().nullable(),
  featured: z.boolean().optional(),
  categoryIds: z.array(z.string()).optional(),
  brandId: z.string().optional().nullable(),
  tags: z.array(z.string()).optional(),
  slug: z.string().optional().nullable(),
  sku: z.string().optional().nullable(),
  countryOfOrigin: z.string().optional().nullable(),
  isHalal: z.boolean().optional().default(true),
  specifications: z.array(
    z.object({
      name: z.string().min(1, "Specification name required"),
      value: z.string().min(1, "Specification value required")
    })
  ).optional().nullable(),
  faqs: z.array(
    z.object({
      question: z.string().min(1, "Question required"),
      answer: z.string().min(1, "Answer required")
    })
  ).optional().nullable(),
  upsellProducts: z.array(z.string()).optional().nullable(),
  upsellCategoryIds: z.array(z.string()).optional().nullable(),
  downsellProducts: z.array(z.string()).optional().nullable(),
  downsellCategoryIds: z.array(z.string()).optional().nullable(),
  seoData: z.record(z.any()).optional().nullable(),
  variants: z.array(z.object({
    id: z.string().optional().nullable(),
    sku: z.string().optional().nullable(),
    price: z.number().min(0, "Price must be non-negative").or(z.string().transform(v => Number(v))),
    specialPrice: z.number().min(0, "Special price must be non-negative").nullable().optional().or(z.string().optional().transform(v => v ? Number(v) : null)),
    specialPriceStart: z.string().nullable().optional(),
    specialPriceEnd: z.string().nullable().optional(),
    image: z.string().optional().nullable(),
    isDefault: z.boolean().optional(),
    enabled: z.boolean().optional(),
    attributes: z.array(z.object({
      name: z.string().min(1, "Attribute name required"),
      value: z.string().min(1, "Attribute value required"),
    })).optional().default([]),
  })).optional().nullable(),
});

export const updateProductSchema = createProductSchema.partial();

// Category Schemas
export const createCategorySchema = z.object({
  name: z.string().min(2, 'Name must be at least 2 characters'),
  parentId: z.string().nullable().optional(),
  image: z.string().nullable().optional(),
  icon: z.string().nullable().optional(),
  description: z.string().nullable().optional(),
  content: z.string().nullable().optional(),
  seoData: z.record(z.any()).nullable().optional(),
  isActive: z.boolean().optional(),
});

export const updateCategorySchema = createCategorySchema.partial();

// Brand Schemas
export const createBrandSchema = z.object({
  name: z.string().min(2, 'Name must be at least 2 characters'),
  logo: z.string().nullable().optional(),
  content: z.string().nullable().optional(),
  seoData: z.record(z.any()).nullable().optional(),
});

export const updateBrandSchema = createBrandSchema.partial();

// Location Schemas
export const createStateSchema = z.object({
  name: z.string().min(2, 'Name is required'),
  status: z.enum(['active', 'inactive']).optional(),
});
export const updateStateSchema = createStateSchema.partial();

export const createCitySchema = z.object({
  name: z.string().min(2, 'Name is required'),
  stateId: z.string().min(1, 'State ID is required'),
  status: z.enum(['active', 'inactive']).optional(),
  deliveryCharge: z.number().min(0).optional().or(z.string().transform(v => Number(v))),
});
export const updateCitySchema = createCitySchema.partial();

export const createAreaSchema = z.object({
  name: z.string().min(2, 'Name is required'),
  cityId: z.string().min(1, 'City ID is required'),
  status: z.enum(['active', 'inactive']).optional(),
  deliveryCharge: z.number().min(0).optional().or(z.string().transform(v => Number(v))),
});
export const updateAreaSchema = createAreaSchema.partial();

// Coupon Schemas
export const createCouponSchema = z.object({
  code: z.string().min(3, 'Coupon code must be at least 3 characters'),
  type: z.enum(['PERCENT', 'FIXED']).optional(),
  discount: z.number().min(0).or(z.string().transform(v => Number(v))),
  minOrder: z.number().min(0).optional().or(z.string().transform(v => Number(v))),
  maxUses: z.number().min(1).optional().or(z.string().transform(v => Number(v))),
  expiresAt: z.string().optional().nullable(),
  active: z.boolean().optional(),
});
export const updateCouponSchema = createCouponSchema.partial();
