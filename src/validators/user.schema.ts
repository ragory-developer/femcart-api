import { z } from 'zod';

export const updateProfileSchema = z.object({
  name: z.string().min(2, 'Name must be at least 2 characters').max(100).optional(),
  phone: z.string().min(10, 'Phone must be at least 10 characters').max(20).optional(),
  address: z.string().max(500).optional().nullable(),
  city: z.string().max(100).optional().nullable(),
  area: z.string().max(100).optional().nullable(),
  gender: z.string().max(20).optional().nullable(),
  dateOfBirth: z.string().datetime().optional().nullable().or(z.date().optional().nullable()),
});

export const createAddressSchema = z.object({
  label: z.string().max(50).optional(),
  address: z.string().min(5, 'Address is required and must be at least 5 characters').max(500),
  city: z.string().max(100).optional(),
  area: z.string().max(100).optional(),
  state: z.string().max(100).optional().nullable(),
  stateId: z.string().cuid().optional().nullable(),
  cityId: z.string().cuid().optional().nullable(),
  areaId: z.string().cuid().optional().nullable(),
  isDefault: z.boolean().optional(),
  recipientName: z.string().max(100).optional().nullable(),
  recipientPhone: z.string().max(20).optional().nullable(),
});

export const updateAddressSchema = createAddressSchema.deepPartial();

export const requestPhoneChangeSchema = z.object({
  newPhone: z.string().min(10, 'Phone must be at least 10 characters').max(20),
});

export const verifyPhoneChangeSchema = z.object({
  newPhone: z.string().min(10, 'Phone must be at least 10 characters').max(20),
  code: z.string().min(4, 'Code must be at least 4 characters').max(10),
});
