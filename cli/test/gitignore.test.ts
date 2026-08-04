import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ensureGitignoreEntry } from "../src/gitignore.js";

describe("ensureGitignoreEntry", () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "skillcanon-gitignore-"));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it("creates .gitignore with the entry when none exists", () => {
    ensureGitignoreEntry(dir, ".skillcanon/credentials.json");
    expect(readFileSync(join(dir, ".gitignore"), "utf8")).toContain(".skillcanon/credentials.json");
  });

  it("appends the entry to an existing .gitignore, preserving prior content", () => {
    writeFileSync(join(dir, ".gitignore"), "node_modules/\n");
    ensureGitignoreEntry(dir, ".skillcanon/credentials.json");
    const content = readFileSync(join(dir, ".gitignore"), "utf8");
    expect(content).toContain("node_modules/");
    expect(content).toContain(".skillcanon/credentials.json");
  });

  it("does not duplicate the entry on repeated calls", () => {
    ensureGitignoreEntry(dir, ".skillcanon/credentials.json");
    ensureGitignoreEntry(dir, ".skillcanon/credentials.json");
    const content = readFileSync(join(dir, ".gitignore"), "utf8");
    const occurrences = content.split(".skillcanon/credentials.json").length - 1;
    expect(occurrences).toBe(1);
  });

  it("leaves the file untouched when it already exists but has no .gitignore at all is false-positive-safe", () => {
    ensureGitignoreEntry(dir, ".skillcanon/credentials.json");
    expect(existsSync(join(dir, ".gitignore"))).toBe(true);
  });
});
