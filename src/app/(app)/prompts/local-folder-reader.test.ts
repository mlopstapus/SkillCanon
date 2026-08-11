/**
 * 013-skill-import-and-external-registries/002, spec
 * 037-local-folder-skill-upload. Only the pure, DOM-independent half of
 * local-folder-reader.ts is unit-tested here (FR-012/SC-005) — the
 * File/FileList/webkitGetAsEntry() half is browser-only glue verified via
 * live manual testing (quickstart.md), matching this repo's established
 * convention for browser-API-only wrappers.
 */
import { describe, expect, it } from "vitest";
import { candidateDirectoriesForPaths } from "./local-folder-reader";

describe("candidateDirectoriesForPaths", () => {
  it("returns the parent directory of any SKILL.md path", () => {
    const paths = ["README.md", ".claude/skills/git-commit/SKILL.md", "src/index.ts"];
    expect(candidateDirectoriesForPaths(paths)).toEqual(new Set([".claude/skills/git-commit"]));
  });

  it("returns an empty root directory for a top-level SKILL.md", () => {
    expect(candidateDirectoriesForPaths(["SKILL.md", "reference.md"])).toEqual(new Set([""]));
  });

  it("returns an empty set when no SKILL.md exists anywhere", () => {
    expect(candidateDirectoriesForPaths(["README.md", "package.json"])).toEqual(new Set());
  });

  it("returns one directory per distinct SKILL.md, even with many unrelated noise paths", () => {
    const paths = [
      "node_modules/some-pkg/SKILL.md", // a real path can still contain a SKILL.md; detection is path-based only
      ".claude/skills/a/SKILL.md",
      ".claude/skills/a/reference.md",
      ".agents/skills/b/SKILL.md",
      "unrelated/deeply/nested/file.txt",
    ];
    expect(candidateDirectoriesForPaths(paths)).toEqual(
      new Set(["node_modules/some-pkg", ".claude/skills/a", ".agents/skills/b"]),
    );
  });
});
