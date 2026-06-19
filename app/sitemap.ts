import type { MetadataRoute } from "next";
import { locales } from "@/lib/i18n";
import { siteConfig } from "@/lib/site-config";

export default function sitemap(): MetadataRoute.Sitemap {
  const base = siteConfig.url;
  const paths = ["", "/terms", "/privacy"];
  return locales.flatMap((lang) =>
    paths.map((p) => ({ url: `${base}/${lang}${p}`, changeFrequency: "monthly" as const, priority: p === "" ? 1 : 0.5 })),
  );
}
