import "server-only";
import { Resend } from "resend";

/**
 * Send an owner notification email via Resend. Shared by the sticker and store
 * confirm flows. Throws when env is missing or Resend errors — callers treat
 * owner email as best-effort and swallow the error so it never fails an order.
 */
export async function sendOwnerEmail(email: {
  subject: string;
  text: string;
  replyTo: string;
}): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  const ownerEmail = process.env.OWNER_NOTIFY_EMAIL;
  const fromEmail = process.env.CONTACT_FROM;
  if (!apiKey || !ownerEmail || !fromEmail) {
    throw new Error(
      "Missing email env vars: RESEND_API_KEY, OWNER_NOTIFY_EMAIL, CONTACT_FROM",
    );
  }
  const resend = new Resend(apiKey);
  const { error } = await resend.emails.send({
    from: fromEmail,
    to: ownerEmail,
    replyTo: email.replyTo,
    subject: email.subject,
    text: email.text,
  });
  if (error) {
    throw new Error(`Resend error: ${error.message}`);
  }
}
