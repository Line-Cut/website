import type { Metadata } from "next";
import { Heebo, Assistant } from "next/font/google";
import { notFound } from "next/navigation";
import "../globals.css";
import { isLocale, locales } from "@/lib/i18n";
import { getDictionary } from "./dictionaries";
import { siteConfig } from "@/lib/site-config";
import { Header } from "@/components/layout/header";
import { Footer } from "@/components/layout/footer";
import { CartProvider } from "@/components/store/cart-provider";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { isAdmin } from "@/lib/auth/admin-access";
import { isFeatureAllowed } from "@/lib/auth/feature-access";

const display = Heebo({
  subsets: ["hebrew", "latin"],
  weight: ["400", "500", "600", "700", "800", "900"],
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
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const slimUser = user ? { id: user.id, email: user.email } : null;
  const [canSeeStore, canSeeStickers, isOwner] = await Promise.all([
    isFeatureAllowed("store", slimUser),
    isFeatureAllowed("stickers", slimUser),
    isAdmin(slimUser),
  ]);

  return (
    <html
      lang={lang}
      dir={dir}
      className={`${display.variable} ${sans.variable} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col bg-paper font-sans text-ink">
        <CartProvider>
          <Header
            lang={lang}
            dict={dict.nav}
            authDict={dict.auth}
            user={user ? { email: user.email ?? null } : null}
            isOwner={isOwner}
            canSeeStore={canSeeStore}
            canSeeStickers={canSeeStickers}
          />
          <main className="flex-1">{children}</main>
          <Footer lang={lang} dict={dict.footer} />
        </CartProvider>
      </body>
    </html>
  );
}
