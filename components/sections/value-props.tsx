import { Check } from "lucide-react";
import { Container } from "@/components/layout/container";
import { Reveal } from "@/components/motion/reveal";
import { VALUE_PROP_KEYS } from "@/lib/content";
import type { Dictionary } from "@/lib/dictionary";

export function ValueProps({ dict }: { dict: Dictionary["valueProps"] }) {
  return (
    <section className="border-y border-line bg-paper-2/40 py-12">
      <Container>
        <ul className="grid gap-x-8 gap-y-4 sm:grid-cols-2 lg:grid-cols-3">
          {VALUE_PROP_KEYS.map((key, i) => (
            <Reveal key={key} delay={i * 0.04}>
              <li className="flex items-start gap-3">
                <Check className="mt-1 h-5 w-5 shrink-0 text-accent" />
                <span className="text-ink/90">{dict.items[key]}</span>
              </li>
            </Reveal>
          ))}
        </ul>
      </Container>
    </section>
  );
}
