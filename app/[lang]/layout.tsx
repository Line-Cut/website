import type { Metadata } from "next";
import { Frank_Ruhl_Libre, Assistant } from "next/font/google";
import { notFound } from "next/navigation";
import "../globals.css";
import { isLocale, locales } from "@/lib/i18n";
import { getDictionary } from "./dictionaries";
import { siteConfig } from "@/lib/site-config";
import { Header } from "@/components/layout/header";
import { Footer } from "@/components/layout/footer";

const display = Frank_Ruhl_Libre({
  subsets: ["hebrew", "latin"],
  weight: ["400", "500", "700", "900"],
  variable: "--font-frank",
});
const sans = Assistant({
  subsets: ["hebrew", "latin"],
  weight: ["300", "400", "500", "600", "700"],
  variable: "--font-assistant",
});

export function generateStaticParams() {
  return locales.map((lang) => ({ lang }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ lang: string }>;
}): Promise<Metadata> {
  const { lang } = await params;
  if (!isLocale(lang)) return {};
  const dict = await getDictionary(lang);
  return {
    metadataBase: new URL(siteConfig.url),
    title: dict.meta.title,
    description: dict.meta.description,
    alternates: {
      languages: { he: `${siteConfig.url}/he`, en: `${siteConfig.url}/en` },
    },
    openGraph: {
      title: dict.meta.title,
      description: dict.meta.description,
      locale: lang === "he" ? "he_IL" : "en_US",
      type: "website",
    },
  };
}

export default async function RootLayout({
  children,
  params,
}: LayoutProps<"/[lang]">) {
  const { lang } = await params;
  if (!isLocale(lang)) notFound();
  const dir = lang === "he" ? "rtl" : "ltr";
  const dict = await getDictionary(lang);
  return (
    <html
      lang={lang}
      dir={dir}
      className={`${display.variable} ${sans.variable} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col bg-paper font-sans text-ink">
        <Header lang={lang} dict={dict.nav} />
        <main className="flex-1">{children}</main>
        <Footer lang={lang} dict={dict.footer} />
      </body>
    </html>
  );
}
