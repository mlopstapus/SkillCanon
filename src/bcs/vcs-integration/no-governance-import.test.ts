import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sources(path);
    return /\.tsx?$/.test(name) && !name.endsWith(".test.ts") ? [path] : [];
  });
}

// 011/003 (PDR-016): "required for a project" is a Prompt Registry catalog
// fact, never a Governance resolution, so this context must not reach into it.
describe("vcs-integration", () => {
  it("imports nothing from the governance bounded context", () => {
    const offenders = sources(__dirname).filter((file) => /from\s+["']@\/bcs\/governance/.test(readFileSync(file, "utf8")));
    expect(offenders).toEqual([]);
  });
});
