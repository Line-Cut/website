/**
 * Server-side owner email guard.
 * Reads OWNER_NOTIFY_EMAIL (comma-separated list of owner emails).
 * Returns true if the given email (lowercased) is in the allow-list.
 */
export function isOwnerEmail(email?: string | null): boolean {
  const raw = process.env.OWNER_NOTIFY_EMAIL;
  if (!raw || !email) return false;

  const normalised = email.toLowerCase().trim();
  const allowList = raw
    .split(",")
    .map((e) => e.toLowerCase().trim())
    .filter(Boolean);

  return allowList.includes(normalised);
}
