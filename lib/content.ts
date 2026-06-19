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
