import Image from "next/image";
import { Button } from "@/components/ui/button";
import { Container } from "@/components/layout/container";
import { Reveal } from "@/components/motion/reveal";
import { SECTION_IDS } from "@/lib/content";
import { whatsappLink } from "@/lib/site-config";
import type { Dictionary } from "@/lib/dictionary";

export function Hero({ dict }: { dict: Dictionary["hero"] }) {
  return (
    <section id={SECTION_IDS.hero} className="relative overflow-hidden">
      <Container className="grid items-center gap-12 py-20 lg:grid-cols-2 lg:py-28">
        <Reveal className="flex flex-col gap-6">
          <p className="text-xs font-extrabold uppercase tracking-[0.2em] text-accent">
            {dict.eyebrow}
          </p>
          <h1 className="font-display text-5xl font-black leading-[0.96] tracking-tight text-balance sm:text-6xl lg:text-7xl">
            {dict.title}
          </h1>
          <p className="max-w-xl text-lg leading-relaxed text-muted">
            {dict.subtitle}
          </p>
          <div className="flex flex-wrap gap-4">
            <Button asChild size="lg">
              <a href={whatsappLink(dict.ctaMessage)} target="_blank" rel="noopener noreferrer">
                {dict.ctaPrimary}
              </a>
            </Button>
            <Button asChild size="lg" variant="ghost">
              <a href={`#${SECTION_IDS.contact}`}>{dict.ctaSecondary} →</a>
            </Button>
          </div>
        </Reveal>

        <Reveal delay={0.15} className="relative">
          {/* TODO(client): replace with a real hero photo at /public/hero.jpg */}
          <div className="relative aspect-[4/3] overflow-hidden rounded-lg border border-line">
            <Image
              src="https://images.unsplash.com/photo-1581092580497-e0d23cbdf1dc?auto=format&fit=crop&w=1200&q=80"
              alt={dict.imageAlt}
              fill
              sizes="(max-width: 1024px) 100vw, 50vw"
              className="object-cover"
              priority
            />
          </div>
        </Reveal>
      </Container>
    </section>
  );
}
