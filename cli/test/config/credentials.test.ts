import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { readCredentials, writeCredentials } from "../../src/config/credentials.js";

describe("writeCredentials / readCredentials", () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "skillcanon-credentials-"));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it("writes .skillcanon/credentials.json with mode 0600", () => {
    writeCredentials(dir, "sk-super-secret-value");
    const stat = statSync(join(dir, ".skillcanon", "credentials.json"));
    expect(stat.mode & 0o777).toBe(0o600);
  });

  it("reads back exactly the written api key", () => {
    writeCredentials(dir, "sk-super-secret-value");
    expect(readCredentials(dir).apiKey).toBe("sk-super-secret-value");
  });

  it("throws a clear, guidance-carrying error when credentials are missing, never including any key value", () => {
    try {
      readCredentials(dir);
      throw new Error("expected readCredentials to throw");
    } catch (err) {
      expect((err as Error).message).toMatch(/run .*init/i);
      expect((err as Error).message).not.toContain("sk-");
    }
  });

  it("overwrites an existing credentials file idempotently on re-write, preserving mode 0600", () => {
    writeCredentials(dir, "sk-first");
    writeCredentials(dir, "sk-second");
    expect(readCredentials(dir).apiKey).toBe("sk-second");
    const stat = statSync(join(dir, ".skillcanon", "credentials.json"));
    expect(stat.mode & 0o777).toBe(0o600);
  });
});
