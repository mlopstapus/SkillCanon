import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { getInstalledVersion } from "../src/version.js";

describe("getInstalledVersion", () => {
  it("returns the version field from cli/package.json", () => {
    const pkgPath = join(dirname(fileURLToPath(import.meta.url)), "..", "package.json");
    const pkg = JSON.parse(readFileSync(pkgPath, "utf8")) as { version: string };

    expect(getInstalledVersion()).toBe(pkg.version);
  });

  it("returns a plain major.minor.patch string", () => {
    expect(getInstalledVersion()).toMatch(/^\d+\.\d+\.\d+$/);
  });
});
