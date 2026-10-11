import { z } from "zod";
export const checkoutSchema = z.object({
  items: z.array(z.object({ productId: z.string().min(1).max(80), quantity: z.number().int().min(1).max(10) })).min(1).max(30),
  paymentMethod: z.literal("RAZORPAY"),
  recipientName: z.string().trim().min(2).max(100),
  phone: z.string().trim().regex(/^[6-9]\d{9}$/, "Enter a valid 10-digit Indian mobile number"),
  addressLine1: z.string().trim().min(5).max(200),
  addressLine2: z.string().trim().max(200).optional().or(z.literal("")),
  city: z.string().trim().min(2).max(80),
  state: z.string().trim().min(2).max(80),
  postalCode: z.string().trim().regex(/^\d{6}$/, "Enter a valid 6-digit PIN code"),
  notes: z.string().trim().max(500).optional().or(z.literal(""))
});
export const productSchema = z.object({
  slug: z.string().trim().min(3).max(120).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  name: z.string().trim().min(2).max(150), category: z.string().trim().min(2).max(80),
  description: z.string().trim().min(10).max(5000), dimensions: z.string().trim().min(2).max(100),
  pricePaise: z.number().int().min(1).max(100000000), compareAtPaise: z.number().int().min(1).optional().nullable(),
  stock: z.number().int().min(0).max(100000), imageUrl: z.string().url().max(1000).optional().nullable(), active: z.boolean().optional()
});
