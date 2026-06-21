import { Container } from "@/components/layout/container";
import { Reveal } from "@/components/motion/reveal";
import {
  Accordion,
  AccordionItem,
  AccordionTrigger,
  AccordionContent,
} from "@/components/ui/accordion";
import { FAQ_KEYS, SECTION_IDS } from "@/lib/content";
import type { Dictionary } from "@/lib/dictionary";

export function Faq({ dict }: { dict: Dictionary["faq"] }) {
  return (
    <section id={SECTION_IDS.faq} className="py-20">
      <Container className="max-w-3xl">
        <Reveal className="mb-10">
          <h2 className="font-display text-3xl font-extrabold sm:text-4xl">{dict.heading}</h2>
        </Reveal>
        <Accordion type="single" collapsible className="w-full">
          {FAQ_KEYS.map((key) => (
            <AccordionItem key={key} value={key}>
              <AccordionTrigger>{dict.items[key].q}</AccordionTrigger>
              <AccordionContent>{dict.items[key].a}</AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      </Container>
    </section>
  );
}
