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
    alias: {
      "@": resolve(__dirname, "."),
      // Stub Next.js "server-only" sentinel — it's a build-time guard that
      // isn't installed as a real package; vitest would fail to resolve it.
      "server-only": resolve(__dirname, "./__mocks__/server-only.ts"),
    },
  },
});
