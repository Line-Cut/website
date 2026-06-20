import { describe, it, expect, vi, afterEach } from "vitest";

/**
 * admin.ts has a module-level window guard and also imports "server-only"
 * (a Next.js build-time sentinel that is unresolvable in vitest/jsdom).
 *
 * To test the guard we need a fresh module evaluation with `window` defined.
 * Strategy: use vi.doMock (not hoisted) + vi.resetModules() so mocks are
 * registered BEFORE the dynamic import re-evaluates the module.
 */

describe("admin window guard", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  it("throws when imported in a browser context (window defined)", async () => {
    // 1. Clear the module cache so admin.ts re-evaluates on next import.
    vi.resetModules();

    // 2. Register stubs AFTER resetModules so they survive the next import.
    //    vi.doMock is not hoisted — it must come after resetModules().
    vi.doMock("server-only", () => ({}));
    vi.doMock("@supabase/supabase-js", () => ({
      createClient: vi.fn(() => ({ mock: "admin" })),
    }));

    // 3. Stub window to simulate a browser runtime.
    vi.stubGlobal("window", {});

    // 4. Now import — module-level guard fires and throws.
    await expect(import("./admin")).rejects.toThrow(/browser/);
  });
});
