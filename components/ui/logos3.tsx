"use client";

import AutoScroll from "embla-carousel-auto-scroll";
import { Carousel, CarouselContent, CarouselItem } from "@/components/ui/carousel";

export interface Logo {
  id: string;
  description: string;
  image: string;
  className?: string;
}

export function Logos3({
  heading,
  logos,
}: {
  heading?: string;
  logos: Logo[];
}) {
  return (
    <div className="flex flex-col items-center">
      {heading ? (
        <h2 className="mb-10 text-center font-display text-2xl font-semibold lg:text-3xl">
          {heading}
        </h2>
      ) : null}
      <div className="relative mx-auto flex w-full items-center justify-center lg:max-w-5xl">
        <Carousel opts={{ loop: true }} plugins={[AutoScroll({ playOnInit: true })]}>
          <CarouselContent className="ml-0">
            {logos.map((logo) => (
              <CarouselItem
                key={logo.id}
                className="flex basis-1/3 justify-center pl-0 sm:basis-1/4 md:basis-1/5 lg:basis-1/6"
              >
                <div className="mx-8 flex shrink-0 items-center justify-center">
                  <img
                    src={logo.image}
                    alt={logo.description}
                    className={logo.className ?? "h-7 w-auto opacity-70"}
                  />
                </div>
              </CarouselItem>
            ))}
          </CarouselContent>
        </Carousel>
        <div className="absolute inset-y-0 start-0 w-12 bg-gradient-to-r from-paper to-transparent" />
        <div className="absolute inset-y-0 end-0 w-12 bg-gradient-to-l from-paper to-transparent" />
      </div>
    </div>
  );
}
