import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { hashContent, readSyncManifest, writeSyncManifest } from "../../src/config/sync-manifest.js";

describe("hashContent", () => {
  it("is deterministic for identical content", () => {
    expect(hashContent("hello")).toBe(hashContent("hello"));
  });

  it("differs for different content", () => {
    expect(hashContent("hello")).not.toBe(hashContent("world"));
  });

  it("produces a 64-character hex sha256 digest", () => {
    expect(hashContent("hello")).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe("readSyncManifest / writeSyncManifest", () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "skillcanon-sync-manifest-"));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it("returns an empty manifest when none exists yet", () => {
    expect(readSyncManifest(dir)).toEqual({ stubs: {} });
  });

  it("round-trips a written manifest (per-file hashes, one skill with two files)", () => {
    writeSyncManifest(dir, { stubs: { a: { "SKILL.md": hashContent("x"), "example.md": hashContent("y") } } });
    expect(readSyncManifest(dir)).toEqual({ stubs: { a: { "SKILL.md": hashContent("x"), "example.md": hashContent("y") } } });
  });

  it("overwrites the manifest on re-write", () => {
    writeSyncManifest(dir, { stubs: { a: { "SKILL.md": "1".repeat(64) } } });
    writeSyncManifest(dir, { stubs: { b: { "SKILL.md": "2".repeat(64) } } });
    expect(readSyncManifest(dir)).toEqual({ stubs: { b: { "SKILL.md": "2".repeat(64) } } });
  });

  it("treats an old-format entry (bare string, one hash per skill) as absent (research.md §2)", () => {
    const path = join(dir, ".skillcanon", "sync-manifest.json");
    writeSyncManifest(dir, { stubs: { a: { "SKILL.md": "1".repeat(64) } } });
    // Overwrite on disk directly with a pre-033 flat entry, bypassing the type-safe writer.
    writeFileSync(path, JSON.stringify({ stubs: { a: "1".repeat(64), b: { "SKILL.md": "2".repeat(64) } } }), "utf8");
    expect(readSyncManifest(dir)).toEqual({ stubs: { b: { "SKILL.md": "2".repeat(64) } } });
  });
});
