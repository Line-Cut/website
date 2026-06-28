export function nextNavigation(
  result: { ok: true; guestToken: string; redirectUrl?: string },
  lang: string,
): { kind: "redirect"; url: string } | { kind: "track"; href: string } {
  if (result.redirectUrl) return { kind: "redirect", url: result.redirectUrl };
  return { kind: "track", href: `/${lang}/store/track/${result.guestToken}` };
}
