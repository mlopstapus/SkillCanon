import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("ownership-transfer quickstart Playwright demo", () => {
  it("has no required env vars — reads config with built-in seed-data defaults", async () => {
    const script = resolve(process.cwd(), "scripts/demo-ownership-transfer-quickstart.mjs");
    const source = await import("node:fs/promises").then((fs) => fs.readFile(script, "utf8"));
    expect(source).toContain('process.env.DEMO_BASE_URL?.trim() || "http://localhost:3000"');
    expect(source).toContain('process.env.DEMO_EMAIL?.trim() || "alice@example.com"');
  });

  it("fails fast (before launching a browser) against an unreachable base URL", () => {
    const script = resolve(process.cwd(), "scripts/demo-ownership-transfer-quickstart.mjs");
    const result = spawnSync(process.execPath, [script], {
      cwd: process.cwd(),
      encoding: "utf8",
      timeout: 15_000,
      env: {
        ...process.env,
        DEMO_BASE_URL: "http://127.0.0.1:1",
        PW_HEADLESS: "true",
      },
    });

    expect(result.status).not.toBe(0);
  });
});
