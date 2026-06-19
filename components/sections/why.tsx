import { Container } from "@/components/layout/container";
import { Reveal } from "@/components/motion/reveal";
import { SECTION_IDS } from "@/lib/content";
import type { Dictionary } from "@/lib/dictionary";

export function Why({ dict }: { dict: Dictionary["why"] }) {
  return (
    <section id={SECTION_IDS.why} className="bg-ink py-20 text-paper">
      <Container>
        <Reveal className="mb-12 max-w-2xl">
          <h2 className="font-display text-3xl font-bold sm:text-4xl">{dict.heading}</h2>
          <p className="mt-4 text-lg text-paper/70">{dict.intro}</p>
        </Reveal>
        <div className="grid gap-x-10 gap-y-8 sm:grid-cols-2 lg:grid-cols-3">
          {dict.items.map((item, i) => (
            <Reveal key={item.title} delay={i * 0.05}>
              <div className="flex flex-col gap-2">
                <span className="font-display text-2xl font-bold text-accent">
                  {String(i + 1).padStart(2, "0")}
                </span>
                <h3 className="font-display text-xl font-semibold">{item.title}</h3>
                <p className="text-paper/70">{item.body}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </Container>
    </section>
  );
}
