import { Container } from "@/components/layout/container";
import { Reveal } from "@/components/motion/reveal";
import { VALUE_PROP_KEYS } from "@/lib/content";
import type { Dictionary } from "@/lib/dictionary";

export function ValueProps({ dict }: { dict: Dictionary["valueProps"] }) {
  return (
    <section className="border-y border-line py-10">
      <Container>
        <ul className="grid gap-x-10 gap-y-3 sm:grid-cols-2 lg:grid-cols-3">
          {VALUE_PROP_KEYS.map((key, i) => (
            <Reveal key={key} delay={i * 0.04}>
              <li className="flex items-baseline gap-3 border-b border-line/70 pb-3 text-ink/90">
                <span className="font-display text-sm font-extrabold text-accent">
                  {String(i + 1).padStart(2, "0")}
                </span>
                <span>{dict.items[key]}</span>
              </li>
            </Reveal>
          ))}
        </ul>
      </Container>
    </section>
  );
}
