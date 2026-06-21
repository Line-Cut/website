import Image from "next/image";
import { Container } from "@/components/layout/container";
import { Reveal } from "@/components/motion/reveal";
import { PROJECTS, SECTION_IDS } from "@/lib/content";
import type { Dictionary } from "@/lib/dictionary";

export function Gallery({ dict }: { dict: Dictionary["gallery"] }) {
  return (
    <section id={SECTION_IDS.work} className="bg-paper-2 py-20">
      <Container>
        <Reveal className="mb-12 max-w-2xl">
          <h2 className="font-display text-3xl font-extrabold sm:text-4xl">{dict.heading}</h2>
          <p className="mt-4 text-lg text-muted">{dict.intro}</p>
        </Reveal>
        <div className="-mx-4 flex snap-x snap-mandatory gap-4 overflow-x-auto px-4 pb-2 md:mx-0 md:grid md:grid-cols-3 md:overflow-visible md:px-0 md:pb-0">
          {PROJECTS.map((project, i) => (
            <Reveal
              key={project.src}
              delay={(i % 3) * 0.05}
              className="w-[78%] shrink-0 snap-start md:w-auto"
            >
              <div className="group relative aspect-[4/3] overflow-hidden rounded-lg border border-line">
                <Image
                  src={project.src}
                  alt={`${dict.imageAltPrefix} ${i + 1}`}
                  fill
                  sizes="(max-width: 768px) 78vw, 33vw"
                  className="object-cover transition-transform duration-500 group-hover:scale-105"
                />
              </div>
            </Reveal>
          ))}
        </div>
      </Container>
    </section>
  );
}
