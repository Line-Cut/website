import { notFound } from "next/navigation";
import { isLocale } from "@/lib/i18n";
import { getDictionary } from "./dictionaries";
import { Hero } from "@/components/sections/hero";
import { ValueProps } from "@/components/sections/value-props";
import { Services } from "@/components/sections/services";
import { Why } from "@/components/sections/why";
import { Process } from "@/components/sections/process";
import { Gallery } from "@/components/sections/gallery";
import { Studio } from "@/components/sections/studio";
import { Clients } from "@/components/sections/clients";
import { Faq } from "@/components/sections/faq";
import { Contact } from "@/components/sections/contact";

export default async function Home({ params }: PageProps<"/[lang]">) {
  const { lang } = await params;
  if (!isLocale(lang)) notFound();
  const dict = await getDictionary(lang);
  return (
    <>
      <Hero dict={dict.hero} />
      <ValueProps dict={dict.valueProps} />
      <Services dict={dict.services} />
      <Why dict={dict.why} />
      <Process dict={dict.process} />
      <Gallery dict={dict.gallery} />
      <Studio dict={dict.studio} />
      <Clients dict={dict.clients} />
      <Faq dict={dict.faq} />
      <Contact dict={dict.contact} lang={lang} />
    </>
  );
}
