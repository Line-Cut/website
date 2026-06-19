import { notFound } from "next/navigation";
import { isLocale } from "@/lib/i18n";
import { getDictionary } from "./dictionaries";

export default async function Home({ params }: PageProps<"/[lang]">) {
  const { lang } = await params;
  if (!isLocale(lang)) notFound();
  const dict = await getDictionary(lang);
  return (
    <main className="flex flex-1 items-center justify-center p-10">
      <h1 className="font-display text-3xl">{dict.hero.title}</h1>
    </main>
  );
}
