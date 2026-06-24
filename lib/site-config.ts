// Canonical public origin (no trailing slash). Set NEXT_PUBLIC_SITE_URL per
// environment to the deployment's real origin; falls back to the production
// domain. Used for metadata, the sitemap, and the Supabase auth redirect — so
// whatever you set here MUST also be in Supabase's Redirect URLs allow-list.
const SITE_URL = (
  process.env.NEXT_PUBLIC_SITE_URL || "https://line-cut.com"
).replace(/\/+$/, "");

export const siteConfig = {
  name: "Line Cut",
  url: SITE_URL,
  legalName: "Line Cut Ltd.",
  businessId: "516741998",
  address: {
    street: "HaSadna 8",
    city: "Holon",
    country: "Israel",
  },
  phone: "+972-54-805-1871",
  email: "linecut1973@gmail.com",
  whatsapp: "972548051871", // digits only, international format
  social: {
    instagram: "https://www.instagram.com/line_cut_holon",
    facebook: "https://www.facebook.com/p/Line-Cut-100066603977255",
  },
  hours: {
    he: "א׳–ה׳ 9:00–17:00",
    en: "Sun–Thu 9:00–17:00",
  },
} as const;

export function whatsappLink(message?: string): string {
  const base = `https://wa.me/${siteConfig.whatsapp}`;
  return message ? `${base}?text=${encodeURIComponent(message)}` : base;
}
