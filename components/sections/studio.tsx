import Image from "next/image";
import { Container } from "@/components/layout/container";
import { Reveal } from "@/components/motion/reveal";
import { Button } from "@/components/ui/button";
import { SECTION_IDS } from "@/lib/content";
import { whatsappLink } from "@/lib/site-config";
import type { Dictionary } from "@/lib/dictionary";

export function Studio({ dict }: { dict: Dictionary["studio"] }) {
  return (
    <section id={SECTION_IDS.studio} className="py-20">
      <Container className="grid items-center gap-12 lg:grid-cols-2">
        <Reveal className="order-2 flex flex-col gap-5 lg:order-1">
          <p className="text-sm font-semibold uppercase tracking-widest text-accent">
            {dict.eyebrow}
          </p>
          <h2 className="font-display text-3xl font-bold sm:text-4xl">{dict.heading}</h2>
          <p className="text-lg text-muted">{dict.body}</p>
          <div>
            <Button asChild variant="outline">
              <a href={whatsappLink(dict.ctaMessage)} target="_blank" rel="noopener noreferrer">
                {dict.cta}
              </a>
            </Button>
          </div>
        </Reveal>
        <Reveal delay={0.1} className="order-1 lg:order-2">
          {/* TODO(client): replace with photos of the owner's own creations */}
          <div className="relative aspect-[4/3] overflow-hidden rounded-2xl border border-line">
            <Image
              src="https://images.unsplash.com/photo-1452860606245-08befc0ff44b?auto=format&fit=crop&w=1200&q=80"
              alt={dict.imageAlt}
              fill
              sizes="(max-width: 1024px) 100vw, 50vw"
              className="object-cover"
            />
          </div>
        </Reveal>
      </Container>
    </section>
  );
}
