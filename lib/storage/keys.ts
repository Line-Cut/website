export function clientKey(opts: {
  userId?: string | null;
  guestToken: string;
}): string {
  return opts.userId ? `u_${opts.userId}` : `g_${opts.guestToken}`;
}

export function orderPrefix(opts: {
  userId?: string | null;
  guestToken: string;
  orderId: string;
}): string {
  return `${clientKey(opts)}/${opts.orderId}`;
}

export function stickerKey(opts: {
  userId?: string | null;
  guestToken: string;
  orderId: string;
  stickerId: string;
}): string {
  return `${orderPrefix(opts)}/${opts.stickerId}.webp`;
}

// ---------------------------------------------------------------------------
// Friendly, operator-readable order folder: `<orderId>-<first>-<last>-<phone>`
// at the bucket root. Used in BOTH the orders and paid buckets. Files are
// re-keyed into this prefix at confirmation, once the client's name + phone are
// known. The sanitized result is stored on `orders.storage_prefix` (the
// sanitization isn't reversible, so don't re-derive it — read the column).
// ---------------------------------------------------------------------------

/**
 * Make a name component safe for an S3 key segment: keep unicode letters
 * (Hebrew included), drop control chars and path separators, and collapse
 * whitespace/hyphens to `_` (hyphen is our component delimiter). Never empty.
 */
export function sanitizeKeyComponent(value: string): string {
  const cleaned = (value ?? "")
    .normalize("NFC")
    .trim()
    // strip ASCII control characters
    .replace(/[\u0000-\u001f\u007f]+/g, "")
    .replace(/[\\/]+/g, "_")
    .replace(/[\s-]+/g, "_");
  return cleaned.length > 0 ? cleaned : "x";
}

/** Phone reduced to digits only (drops +, spaces, dashes). Never empty. */
export function sanitizePhoneComponent(phone: string): string {
  const digits = (phone ?? "").replace(/\D+/g, "");
  return digits.length > 0 ? digits : "x";
}

export function friendlyOrderPrefix(opts: {
  orderId: string;
  firstName: string;
  lastName: string;
  phone: string;
}): string {
  return [
    opts.orderId,
    sanitizeKeyComponent(opts.firstName),
    sanitizeKeyComponent(opts.lastName),
    sanitizePhoneComponent(opts.phone),
  ].join("-");
}

export function friendlyStickerKey(prefix: string, stickerId: string): string {
  return `${prefix}/${stickerId}.webp`;
}

export function metadataKey(prefix: string): string {
  return `${prefix}/metadata.pdf`;
}

export function receiptKey(prefix: string): string {
  return `${prefix}/receipt.pdf`;
}
