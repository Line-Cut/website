"use client";

import { useEffect, useRef, useState } from "react";
import AutoScroll from "embla-carousel-auto-scroll";
import { Carousel, CarouselContent, CarouselItem } from "@/components/ui/carousel";

export interface Logo {
  id: string;
  description: string;
  image: string;
  className?: string;
  /** Shown as a styled text wordmark when the logo image is missing or fails to load. */
  label?: string;
}

type Tone = "light" | "dark";

// Renders the logo image, falling back to a styled text wordmark when the file
// is absent or fails to load (e.g. before the real /public/clients logos are added).
function LogoMark({ logo, tone }: { logo: Logo; tone: Tone }) {
  const [failed, setFailed] = useState(false);
  const ref = useRef<HTMLImageElement>(null);

  // The image's error event can fire during SSR/before hydration, so onError alone
  // misses it. On mount, treat an already-completed image with zero width as broken.
  useEffect(() => {
    const img = ref.current;
    if (img && img.complete && img.naturalWidth === 0) setFailed(true);
  }, []);

  if (failed || !logo.image) {
    return (
      <span
        className={`whitespace-nowrap text-center font-display text-base font-medium ${
          tone === "dark" ? "text-paper/70" : "text-muted"
        }`}
      >
        {logo.label ?? logo.description}
      </span>
    );
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      ref={ref}
      src={logo.image}
      alt={logo.description}
      className={logo.className ?? "h-7 w-auto opacity-70"}
      onError={() => setFailed(true)}
    />
  );
}

export function Logos3({
  heading,
  logos,
  tone = "light",
}: {
  heading?: string;
  logos: Logo[];
  tone?: Tone;
}) {
  const fade = tone === "dark" ? "from-ink" : "from-paper";
  return (
    <div className="flex flex-col items-center">
      {heading ? (
        <h2 className="mb-10 text-center font-display text-2xl font-semibold lg:text-3xl">
          {heading}
        </h2>
      ) : null}
      <div className="relative mx-auto w-full lg:max-w-5xl">
        <Carousel className="w-full" opts={{ loop: true }} plugins={[AutoScroll({ playOnInit: true })]}>
          <CarouselContent className="ml-0">
            {logos.map((logo) => (
              <CarouselItem
                key={logo.id}
                className="flex basis-1/3 justify-center pl-0 sm:basis-1/4 md:basis-1/5 lg:basis-1/6"
              >
                <div className="mx-8 flex h-10 shrink-0 items-center justify-center">
                  <LogoMark logo={logo} tone={tone} />
                </div>
              </CarouselItem>
            ))}
          </CarouselContent>
        </Carousel>
        <div className={`absolute inset-y-0 start-0 w-12 bg-gradient-to-r ${fade} to-transparent`} />
        <div className={`absolute inset-y-0 end-0 w-12 bg-gradient-to-l ${fade} to-transparent`} />
      </div>
    </div>
  );
}
