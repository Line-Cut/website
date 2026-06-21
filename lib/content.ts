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
  { id: "gil", logo: "/clients/gil.png" },
  { id: "keshet", logo: "/clients/keshet.png" },
  { id: "shufra", logo: "/clients/shufra.png" },
  { id: "story", logo: "/clients/story.png" },
  { id: "aluf", logo: "/clients/aluf.svg" },
  { id: "elephant", logo: "/clients/elephant.png" },
  // Cultural institutions / museums
  { id: "taMuseum", logo: "/clients/ta-museum.png" },
  { id: "designMuseumHolon", logo: "/clients/design-museum-holon.svg" },
  { id: "rgMuseum", logo: "/clients/rg-museum.jpg" },
  { id: "islamMuseum", logo: "/clients/islam-museum.png" },
  { id: "einHarod", logo: "/clients/ein-harod.png" },
] as const;

// Portfolio projects shown in the work grid, in display order. To add a real
// project: replace `src` with "/work/<file>.jpg" and drop the file in /public/work.
// Until real photos arrive these point at neutral placeholders.
export type Project = { src: string };

export const PROJECTS: readonly Project[] = [
  { src: "https://images.unsplash.com/photo-1558655146-9f40138edfeb?auto=format&fit=crop&w=900&q=80" },
  { src: "https://images.unsplash.com/photo-1607082348824-0a96f2a4b9da?auto=format&fit=crop&w=900&q=80" },
  { src: "https://images.unsplash.com/photo-1561070791-2526d30994b5?auto=format&fit=crop&w=900&q=80" },
  { src: "https://images.unsplash.com/photo-1581291518857-4e27b48ff24e?auto=format&fit=crop&w=900&q=80" },
  { src: "https://images.unsplash.com/photo-1572044162444-ad60f128bdea?auto=format&fit=crop&w=900&q=80" },
  { src: "https://images.unsplash.com/photo-1503602642458-232111445657?auto=format&fit=crop&w=900&q=80" },
] as const;
