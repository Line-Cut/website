import { Container } from "@/components/layout/container";
import { Reveal } from "@/components/motion/reveal";
import { SERVICE_KEYS, SERVICE_ICONS, SECTION_IDS } from "@/lib/content";
import type { Dictionary } from "@/lib/dictionary";

export function Services({ dict }: { dict: Dictionary["services"] }) {
  return (
    <section id={SECTION_IDS.services} className="py-20">
      <Container>
        <Reveal className="mb-12 max-w-2xl">
          <h2 className="font-display text-3xl font-extrabold sm:text-4xl">{dict.heading}</h2>
          <p className="mt-4 text-lg text-muted">{dict.intro}</p>
        </Reveal>
        <div className="grid gap-px overflow-hidden rounded-lg border border-line bg-line sm:grid-cols-2 lg:grid-cols-3">
          {SERVICE_KEYS.map((key, i) => {
            const Icon = SERVICE_ICONS[key];
            const item = dict.items[key];
            return (
              <Reveal key={key} delay={i * 0.05}>
                <div className="flex h-full flex-col gap-3 bg-paper p-6 transition-colors hover:bg-paper-2">
                  <Icon className="h-6 w-6 text-accent" strokeWidth={1.75} />
                  <h3 className="font-display text-xl font-bold">{item.title}</h3>
                  <p className="text-muted">{item.description}</p>
                  <ul className="mt-1 flex flex-col gap-1.5 text-sm text-ink/80">
                    {item.examples.map((ex) => (
                      <li key={ex} className="flex items-center gap-2">
                        <span className="h-1 w-1 rounded-full bg-accent" />
                        {ex}
                      </li>
                    ))}
                  </ul>
                </div>
              </Reveal>
            );
          })}
        </div>
      </Container>
    </section>
  );
}
