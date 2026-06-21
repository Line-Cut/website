import { Container } from "@/components/layout/container";
import { Logos3, type Logo } from "@/components/ui/logos3";
import { CLIENTS, SECTION_IDS } from "@/lib/content";
import type { Dictionary } from "@/lib/dictionary";

export function Clients({ dict }: { dict: Dictionary["clients"] }) {
  // Real clients from lib/content.ts, named via the localized dictionary. Each item
  // shows its logo file from /public/clients, falling back to a text wordmark until
  // the file is added (see LogoMark in components/ui/logos3.tsx).
  const logos: Logo[] = CLIENTS.map((client) => {
    const name = dict.names[client.id as keyof typeof dict.names];
    return {
      id: client.id,
      description: name,
      label: name,
      image: client.logo,
      className: "h-9 w-auto opacity-70",
    };
  });

  return (
    <section id={SECTION_IDS.clients} className="bg-ink-deep py-16 text-paper">
      <Container>
        <Logos3 heading={dict.heading} logos={logos} tone="dark" />
      </Container>
    </section>
  );
}
