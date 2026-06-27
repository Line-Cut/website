import { z } from "zod";
import { MAX_CART_QUANTITY, MAX_CART_LINES } from "@/lib/store/pricing";
import type { CartItemInput } from "@/lib/store/types";

export const cartItemSchema = z.object({
  productId: z.string().trim().min(1),
  quantity: z.number().int().min(1).max(MAX_CART_QUANTITY),
  selectedOptions: z.record(z.string(), z.string()).optional(),
});

export const cartSchema = z.array(cartItemSchema).min(1).max(MAX_CART_LINES);

export function parseCartItems(
  data: unknown,
): { success: true; data: CartItemInput[] } | { success: false; message: string } {
  const result = cartSchema.safeParse(data);
  if (result.success) return { success: true, data: result.data };
  return { success: false, message: "invalid_cart" };
}
