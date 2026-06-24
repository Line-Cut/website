/**
 * Server-side sticker-shop access guard.
 *
 * By default the sticker shop is PRIVATE: only an explicit allow-list of
 * signed-in accounts may build, save, edit, or place orders. This is enforced
 * on the server in two places — the sticker pages redirect non-allowed
 * visitors, and every order action in `app/actions/stickers.ts` re-checks (the
 * actions are directly-callable endpoints, so the page gate alone is not
 * enough).
 *
 * Two env vars control this:
 * - `STICKER_SHOP_PUBLIC` — set to a truthy value (true/1/yes/on) to disable
 *   the allow-list entirely and open the shop to everyone, guests included
 *   (the original pre-restriction behavior). Unset/false ⇒ restricted.
 * - `STICKER_SHOP_ALLOWED_EMAILS` — comma-separated override of the default
 *   allow-list below (case-insensitive). Only consulted while restricted.
 */
export const DEFAULT_STICKER_SHOP_EMAILS = [
  "yuval.altun101@gmail.com",
  "linecut1973@gmail.com",
] as const;

/**
 * Whether the allow-list is in effect. Restricted by default; returns false
 * (open to all) only when STICKER_SHOP_PUBLIC is explicitly truthy.
 */
export function isStickerShopRestricted(): boolean {
  const raw = process.env.STICKER_SHOP_PUBLIC;
  if (!raw) return true;
  const v = raw.toLowerCase().trim();
  const open = v === "true" || v === "1" || v === "yes" || v === "on";
  return !open;
}

function allowList(): string[] {
  const raw = process.env.STICKER_SHOP_ALLOWED_EMAILS;
  const source =
    raw && raw.trim() ? raw.split(",") : [...DEFAULT_STICKER_SHOP_EMAILS];
  return source.map((e) => e.toLowerCase().trim()).filter(Boolean);
}

/**
 * Returns true if the given email (lowercased, trimmed) is allowed to use the
 * sticker shop. Returns false for null/undefined/empty emails.
 */
export function isStickerShopUser(email?: string | null): boolean {
  if (!email) return false;
  const normalised = email.toLowerCase().trim();
  if (!normalised) return false;
  return allowList().includes(normalised);
}
