import { z } from "zod";
import type { DeliveryInput } from "@/lib/stickers/types";

export const checkoutSchema = z
  .object({
    method: z.enum(["pickup", "shipping"]),
    fullName: z.string().trim().min(2, "required"),
    phone: z.string().trim().min(6, "invalid_phone"),
    email: z.string().trim().email("invalid_email"),
    addressLine1: z.string().trim().optional(),
    addressLine2: z.string().trim().optional(),
    city: z.string().trim().optional(),
    postalCode: z.string().trim().optional(),
    country: z.string().trim().optional(),
    notes: z.string().trim().optional(),
  })
  .superRefine((data, ctx) => {
    if (data.method === "shipping") {
      if (!data.addressLine1) {
        ctx.addIssue({ code: "custom", path: ["addressLine1"], message: "required" });
      }
      if (!data.city) {
        ctx.addIssue({ code: "custom", path: ["city"], message: "required" });
      }
      if (!data.postalCode) {
        ctx.addIssue({ code: "custom", path: ["postalCode"], message: "required" });
      }
    }
  });

export type CheckoutInput = z.infer<typeof checkoutSchema>;

// Compile-time guard: keep the checkout schema in sync with the shared DeliveryInput shape.
type _CheckoutMatchesDeliveryInput = CheckoutInput extends DeliveryInput ? true : never;
const _checkoutTypeGuard: _CheckoutMatchesDeliveryInput = true;
void _checkoutTypeGuard;

export function parseCheckout(
  data: unknown,
): { success: true; data: CheckoutInput } | { success: false; errors: Record<string, string> } {
  const result = checkoutSchema.safeParse(data);
  if (result.success) return { success: true, data: result.data };
  const errors: Record<string, string> = {};
  for (const issue of result.error.issues) {
    const key = String(issue.path[0] ?? "form");
    if (!errors[key]) errors[key] = issue.message;
  }
  return { success: false, errors };
}
