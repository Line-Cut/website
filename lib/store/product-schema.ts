import { z } from "zod";

const optionChoiceSchema = z.object({
  value: z.string().trim().min(1),
  labelHe: z.string().trim().min(1),
  labelEn: z.string().trim().min(1),
  priceDelta: z.number().int(),
});

const optionSchema = z.object({
  key: z.string().trim().min(1),
  labelHe: z.string().trim().min(1),
  labelEn: z.string().trim().min(1),
  choices: z.array(optionChoiceSchema).min(1),
});

const imageSchema = z.object({
  url: z.string().url(),
  sortIndex: z.number().int().optional(),
});

/**
 * Admin product create/update input. Slug is a URL-safe kebab string. Price and
 * priceDeltas are agorot (integer minor units). An active product must have a
 * primary image (mirrors the DB CHECK).
 */
export const productInputSchema = z
  .object({
    slug: z
      .string()
      .trim()
      .min(1, "required")
      .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "invalid_slug"),
    status: z.enum(["draft", "active", "archived"]),
    titleHe: z.string().trim().min(1, "required"),
    titleEn: z.string().trim().min(1, "required"),
    descriptionHe: z.string().trim().default(""),
    descriptionEn: z.string().trim().default(""),
    price: z.number().int().min(0, "invalid_price"),
    currency: z.string().trim().min(1).default("ILS"),
    imageUrl: z.string().url().nullable().optional(),
    images: z.array(imageSchema).default([]),
    options: z.array(optionSchema).default([]),
    sortIndex: z.number().int().default(0),
  })
  .superRefine((data, ctx) => {
    if (data.status === "active" && !data.imageUrl) {
      ctx.addIssue({
        code: "custom",
        path: ["imageUrl"],
        message: "image_required_for_active",
      });
    }
    // Duplicate option keys would make selection ambiguous.
    const keys = data.options.map((o) => o.key);
    if (new Set(keys).size !== keys.length) {
      ctx.addIssue({ code: "custom", path: ["options"], message: "duplicate_option_key" });
    }
  });

export type ProductInput = z.infer<typeof productInputSchema>;

export function parseProductInput(
  data: unknown,
):
  | { success: true; data: ProductInput }
  | { success: false; errors: Record<string, string> } {
  const result = productInputSchema.safeParse(data);
  if (result.success) return { success: true, data: result.data };
  const errors: Record<string, string> = {};
  for (const issue of result.error.issues) {
    const key = String(issue.path[0] ?? "form");
    if (!errors[key]) errors[key] = issue.message;
  }
  return { success: false, errors };
}
