import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("ownership-transfer Playwright demo", () => {
  it("fails before launching a browser when required demo inputs are absent", () => {
    const script = resolve(process.cwd(), "scripts/demo-ownership-transfer.mjs");
    const result = spawnSync(process.execPath, [script], {
      cwd: process.cwd(),
      encoding: "utf8",
      env: {
        ...process.env,
        DEMO_EMAIL: "",
        DEMO_PASSWORD: "",
        DEMO_PROMPT_NAME: "",
        DEMO_DESTINATION_NAME: "",
      },
    });

    expect(result.status).toBe(1);
    expect(result.stderr).toContain(
      "DEMO_EMAIL, DEMO_PASSWORD, DEMO_PROMPT_NAME, and DEMO_DESTINATION_NAME are required",
    );
  });
});
