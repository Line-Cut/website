export const siteConfig = {
  name: "Line Cut",
  legalName: "Line Cut Ltd.",
  businessId: "516741998",
  address: {
    street: "HaSadna 8",
    city: "Holon",
    country: "Israel",
  },
  // TODO(client): replace placeholders below before launch
  phone: "+972-00-000-0000",
  email: "info@example.com",
  whatsapp: "972500000000", // digits only, international format
  social: {
    instagram: "https://instagram.com/", // TODO(client)
    facebook: "https://facebook.com/", // TODO(client)
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
