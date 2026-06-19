import Image from "next/image";
import { Container } from "@/components/layout/container";
import { Reveal } from "@/components/motion/reveal";
import { SECTION_IDS } from "@/lib/content";
import type { Dictionary } from "@/lib/dictionary";

// TODO(client): replace with real project photos in /public/work and update alts in the dictionary.
const PLACEHOLDER_IMAGES = [
  "https://images.unsplash.com/photo-1558655146-9f40138edfeb?auto=format&fit=crop&w=800&q=80",
  "https://images.unsplash.com/photo-1607082348824-0a96f2a4b9da?auto=format&fit=crop&w=800&q=80",
  "https://images.unsplash.com/photo-1561070791-2526d30994b5?auto=format&fit=crop&w=800&q=80",
  "https://images.unsplash.com/photo-1581291518857-4e27b48ff24e?auto=format&fit=crop&w=800&q=80",
  "https://images.unsplash.com/photo-1572044162444-ad60f128bdea?auto=format&fit=crop&w=800&q=80",
  "https://images.unsplash.com/photo-1503602642458-232111445657?auto=format&fit=crop&w=800&q=80",
];

export function Gallery({ dict }: { dict: Dictionary["gallery"] }) {
  return (
    <section id={SECTION_IDS.work} className="bg-paper-2/40 py-20">
      <Container>
        <Reveal className="mb-12 max-w-2xl">
          <h2 className="font-display text-3xl font-bold sm:text-4xl">{dict.heading}</h2>
          <p className="mt-4 text-lg text-muted">{dict.intro}</p>
        </Reveal>
        <div className="grid grid-cols-2 gap-4 md:grid-cols-3">
          {PLACEHOLDER_IMAGES.map((src, i) => (
            <Reveal key={src} delay={(i % 3) * 0.05}>
              <div className="relative aspect-square overflow-hidden rounded-xl border border-line">
                <Image
                  src={src}
                  alt={`${dict.imageAltPrefix} ${i + 1}`}
                  fill
                  sizes="(max-width: 768px) 50vw, 33vw"
                  className="object-cover transition-transform duration-500 hover:scale-105"
                />
              </div>
            </Reveal>
          ))}
        </div>
      </Container>
    </section>
  );
}
