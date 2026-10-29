import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// Mirrors tsconfig.json's `paths` — Next.js resolves those natively via
// webpack/Turbopack, but Vitest is a separate (Vite) bundler that needs its
// own alias config to resolve the same `@/...` imports in tests.
export default defineConfig({
  resolve: {
    alias: {
      "@/bcs": fileURLToPath(new URL("./src/bcs", import.meta.url)),
      "@/shared": fileURLToPath(new URL("./src/shared", import.meta.url)),
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  test: {
    exclude: [
      ".next/**",
      "build/**",
      "coverage/**",
      "dist/**",
      "e2e/**",
      "legacy/**",
      "node_modules/**",
    ],
  },
});
