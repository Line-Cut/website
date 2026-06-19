import { Container } from "@/components/layout/container";
import { Reveal } from "@/components/motion/reveal";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { SERVICE_KEYS, SERVICE_ICONS, SECTION_IDS } from "@/lib/content";
import type { Dictionary } from "@/lib/dictionary";

export function Services({ dict }: { dict: Dictionary["services"] }) {
  return (
    <section id={SECTION_IDS.services} className="py-20">
      <Container>
        <Reveal className="mb-12 max-w-2xl">
          <h2 className="font-display text-3xl font-bold sm:text-4xl">{dict.heading}</h2>
          <p className="mt-4 text-lg text-muted">{dict.intro}</p>
        </Reveal>
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {SERVICE_KEYS.map((key, i) => {
            const Icon = SERVICE_ICONS[key];
            const item = dict.items[key];
            return (
              <Reveal key={key} delay={i * 0.05}>
                <Card className="h-full transition-shadow hover:shadow-md">
                  <CardHeader>
                    <span className="flex h-11 w-11 items-center justify-center rounded-lg bg-accent/10 text-accent">
                      <Icon className="h-6 w-6" />
                    </span>
                    <CardTitle>{item.title}</CardTitle>
                    <CardDescription>{item.description}</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <ul className="flex flex-col gap-1.5 text-sm text-ink/80">
                      {item.examples.map((ex) => (
                        <li key={ex} className="flex items-center gap-2">
                          <span className="h-1 w-1 rounded-full bg-accent" />
                          {ex}
                        </li>
                      ))}
                    </ul>
                  </CardContent>
                </Card>
              </Reveal>
            );
          })}
        </div>
      </Container>
    </section>
  );
}
