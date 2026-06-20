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
