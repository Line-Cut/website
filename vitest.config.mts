import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import { resolve } from "node:path";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./vitest.setup.ts"],
  },
  resolve: {
    alias: [
      // Stub Next.js "server-only" sentinel — it's a build-time guard that
      // isn't installed as a real package; vitest would fail to resolve it.
      { find: "server-only", replacement: resolve(__dirname, "./__mocks__/server-only.ts") },
      // Stub server-only Supabase clients and admin helpers so pure unit tests
      // can import feature-access.ts without triggering browser guards.
      // These MUST appear before the generic "@" alias so the specific paths win.
      { find: "@/lib/supabase/admin", replacement: resolve(__dirname, "./__mocks__/supabase-admin.ts") },
      { find: "@/lib/supabase/server", replacement: resolve(__dirname, "./__mocks__/supabase-server.ts") },
      { find: "@/lib/auth/admin-access", replacement: resolve(__dirname, "./__mocks__/admin-access.ts") },
      // Generic path alias — must come last so specific overrides above are tried first.
      { find: "@", replacement: resolve(__dirname, ".") },
    ],
  },
});
