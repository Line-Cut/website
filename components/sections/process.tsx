import { Container } from "@/components/layout/container";
import { Reveal } from "@/components/motion/reveal";
import { PROCESS_STEP_KEYS, SECTION_IDS } from "@/lib/content";
import type { Dictionary } from "@/lib/dictionary";

export function Process({ dict }: { dict: Dictionary["process"] }) {
  return (
    <section id={SECTION_IDS.process} className="py-20">
      <Container>
        <Reveal className="mb-12 max-w-2xl">
          <h2 className="font-display text-3xl font-extrabold sm:text-4xl">{dict.heading}</h2>
          <p className="mt-4 text-lg text-muted">{dict.intro}</p>
        </Reveal>
        <ol className="grid gap-8 md:grid-cols-5">
          {PROCESS_STEP_KEYS.map((key, i) => (
            <Reveal key={key} delay={i * 0.06}>
              <li className="flex flex-col gap-3 border-t border-line pt-4">
                <span className="font-display text-2xl font-extrabold text-accent">
                  {String(i + 1).padStart(2, "0")}
                </span>
                <h3 className="font-display text-lg font-bold">{dict.steps[key].title}</h3>
                <p className="text-sm text-muted">{dict.steps[key].body}</p>
              </li>
            </Reveal>
          ))}
        </ol>
      </Container>
    </section>
  );
}
