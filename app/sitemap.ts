import type { MetadataRoute } from "next";
import { locales } from "@/lib/i18n";
import { siteConfig } from "@/lib/site-config";
import { listActiveProductSlugs } from "@/lib/store/product-view";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = siteConfig.url;
  const paths = ["", "/store", "/terms", "/privacy"];

  let slugs: string[] = [];
  try {
    slugs = await listActiveProductSlugs();
  } catch {
    slugs = [];
  }

  return locales.flatMap((lang) => [
    ...paths.map((p) => ({
      url: `${base}/${lang}${p}`,
      changeFrequency: "monthly" as const,
      priority: p === "" ? 1 : 0.5,
    })),
    ...slugs.map((slug) => ({
      url: `${base}/${lang}/store/${slug}`,
      changeFrequency: "weekly" as const,
      priority: 0.6,
    })),
  ]);
}
