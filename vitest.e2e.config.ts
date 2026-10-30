import { defineConfig } from "vitest/config";
import E2ESequencer from "./e2e/sequencer";

// Browser walk of a running instance (e2e/); kept out of `pnpm test`, which
// must not need a live server.
export default defineConfig({
  test: {
    include: ["e2e/**/*.e2e.test.ts"],
    fileParallelism: false,
    sequence: { sequencer: E2ESequencer },
    testTimeout: 60_000,
    hookTimeout: 60_000,
  },
});
