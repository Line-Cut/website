import {
  Sticker,
  Scissors,
  LayoutPanelTop,
  Landmark,
  Wrench,
  type LucideIcon,
} from "lucide-react";

export const SECTION_IDS = {
  hero: "top",
  services: "services",
  why: "why",
  process: "process",
  work: "work",
  studio: "studio",
  clients: "clients",
  faq: "faq",
  contact: "contact",
} as const;

export const VALUE_PROP_KEYS = [
  "accurate",
  "oneRoof",
  "review",
  "custom",
  "exhibitions",
  "fast",
  "audience",
] as const;

export const SERVICE_KEYS = [
  "stickers",
  "signage",
  "rigid",
  "exhibitions",
  "custom",
] as const;

export const SERVICE_ICONS: Record<(typeof SERVICE_KEYS)[number], LucideIcon> = {
  stickers: Sticker,
  signage: Scissors,
  rigid: LayoutPanelTop,
  exhibitions: Landmark,
  custom: Wrench,
};

export const PROCESS_STEP_KEYS = [
  "file",
  "review",
  "production",
  "finishing",
  "delivery",
] as const;

export const FAQ_KEYS = ["formats", "turnaround", "materials", "delivery", "minOrder"] as const;

// Real clients shown in the logo strip, in display order: production houses first,
// then cultural institutions / museums. `logo` points at a file under /public/clients/;
// drop the real logo there (svg preferred, or png) and it appears automatically —
// until then the bilingual name from dict.clients.names.<id> renders as a text wordmark.
// TODO(client): add the actual logo files in /public/clients/.
export type Client = { id: string; logo: string };

export const CLIENTS: readonly Client[] = [
  // Production houses
  { id: "artza", logo: "/clients/artza.png" },
  { id: "anani", logo: "/clients/anani.png" },
  { id: "teddy", logo: "/clients/teddy.png" },
  { id: "gil", logo: "/clients/gil.svg" },
  { id: "keshet", logo: "/clients/keshet.png" },
  { id: "shufra", logo: "/clients/shufra.svg" },
  { id: "story", logo: "/clients/story.png" },
  { id: "aluf", logo: "/clients/aluf.svg" },
  { id: "elephant", logo: "/clients/elephant.png" },
  // Cultural institutions / museums
  { id: "taMuseum", logo: "/clients/ta-museum.svg" },
  { id: "designMuseumHolon", logo: "/clients/design-museum-holon.svg" },
  { id: "rgMuseum", logo: "/clients/rg-museum.svg" },
  { id: "islamMuseum", logo: "/clients/islam-museum.svg" },
  { id: "einHarod", logo: "/clients/ein-harod.png" },
] as const;
