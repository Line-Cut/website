import type { MetadataRoute } from "next";
import { locales } from "@/lib/i18n";

export default function sitemap(): MetadataRoute.Sitemap {
  const base = "https://linecut.example"; // TODO(client): production domain
  const paths = ["", "/terms", "/privacy"];
  return locales.flatMap((lang) =>
    paths.map((p) => ({ url: `${base}/${lang}${p}`, changeFrequency: "monthly" as const, priority: p === "" ? 1 : 0.5 })),
  );
}
