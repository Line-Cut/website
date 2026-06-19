import { describe, it, expect } from "vitest";
import he from "./dictionaries/he.json";
import en from "./dictionaries/en.json";

function keyPaths(obj: unknown, prefix = ""): string[] {
  if (obj === null || typeof obj !== "object") return [prefix];
  if (Array.isArray(obj)) {
    return obj.flatMap((v, i) => keyPaths(v, `${prefix}[${i}]`));
  }
  return Object.entries(obj as Record<string, unknown>).flatMap(([k, v]) =>
    keyPaths(v, prefix ? `${prefix}.${k}` : k),
  );
}

describe("dictionary parity", () => {
  it("he and en share identical key/array shapes", () => {
    expect(keyPaths(he).sort()).toEqual(keyPaths(en).sort());
  });
});
