import { Container } from "@/components/layout/container";
import { Logos3, type Logo } from "@/components/ui/logos3";
import { SECTION_IDS } from "@/lib/content";
import type { Dictionary } from "@/lib/dictionary";

// Placeholder client logos. TODO(client): replace with real client logos in /public/clients.
const PLACEHOLDER_LOGOS: Logo[] = Array.from({ length: 8 }, (_, i) => ({
  id: `client-${i + 1}`,
  description: `Client ${i + 1}`,
  image:
    "https://deifkwefumgah.cloudfront.net/shadcnblocks/block/logos/shadcn-ui-wordmark.svg",
  className: "h-6 w-auto opacity-60",
}));

export function Clients({ dict }: { dict: Dictionary["clients"] }) {
  return (
    <section id={SECTION_IDS.clients} className="border-y border-line bg-paper-2/30 py-16">
      <Container>
        <Logos3 heading={dict.heading} logos={PLACEHOLDER_LOGOS} />
      </Container>
    </section>
  );
}
