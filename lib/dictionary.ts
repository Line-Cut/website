// Derives the dictionary shape from the Hebrew source of truth.
// Type-only — never bundles JSON into client code.
type HeModule = typeof import("@/app/[lang]/dictionaries/he.json");
export type Dictionary = HeModule extends { default: infer D } ? D : HeModule;
