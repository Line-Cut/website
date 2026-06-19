import { z } from "zod";

export const contactSchema = z.object({
  name: z.string().trim().min(2, "required"),
  email: z.string().trim().email("invalid_email"),
  phone: z.string().trim().optional().or(z.literal("")),
  message: z.string().trim().min(10, "too_short"),
});

export type ContactInput = z.infer<typeof contactSchema>;

export function parseContact(
  data: unknown,
):
  | { success: true; data: ContactInput }
  | { success: false; errors: Record<string, string> } {
  const result = contactSchema.safeParse(data);
  if (result.success) return { success: true, data: result.data };
  const errors: Record<string, string> = {};
  for (const issue of result.error.issues) {
    const key = String(issue.path[0] ?? "form");
    if (!errors[key]) errors[key] = issue.message;
  }
  return { success: false, errors };
}
