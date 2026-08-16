import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { readGithubPackagesToken } from "../../src/config/npm-auth.js";

let homeDir: string;
let cwdDir: string;

beforeEach(() => {
  homeDir = mkdtempSync(join(tmpdir(), "skillcanon-home-"));
  cwdDir = mkdtempSync(join(tmpdir(), "skillcanon-cwd-"));
});

afterEach(() => {
  rmSync(homeDir, { recursive: true, force: true });
  rmSync(cwdDir, { recursive: true, force: true });
});

describe("readGithubPackagesToken", () => {
  it("returns null when neither .npmrc exists", () => {
    expect(readGithubPackagesToken(homeDir, cwdDir)).toBeNull();
  });

  it("reads the token from the home directory's .npmrc", () => {
    writeFileSync(join(homeDir, ".npmrc"), "//npm.pkg.github.com/:_authToken=ghp_hometoken123\n");
    expect(readGithubPackagesToken(homeDir, cwdDir)).toBe("ghp_hometoken123");
  });

  it("prefers the cwd .npmrc over the home directory's when both are present", () => {
    writeFileSync(join(homeDir, ".npmrc"), "//npm.pkg.github.com/:_authToken=ghp_hometoken\n");
    writeFileSync(join(cwdDir, ".npmrc"), "//npm.pkg.github.com/:_authToken=ghp_cwdtoken\n");
    expect(readGithubPackagesToken(homeDir, cwdDir)).toBe("ghp_cwdtoken");
  });

  it("returns null when a .npmrc exists but has no matching auth-token line", () => {
    writeFileSync(homeDir + "/.npmrc", "engine-strict=true\n@mlopstapus:registry=https://npm.pkg.github.com\n");
    expect(readGithubPackagesToken(homeDir, cwdDir)).toBeNull();
  });

  it("ignores comment and blank lines", () => {
    writeFileSync(
      join(homeDir, ".npmrc"),
      "; a comment\n\n# another comment\n//npm.pkg.github.com/:_authToken=ghp_realtoken\n",
    );
    expect(readGithubPackagesToken(homeDir, cwdDir)).toBe("ghp_realtoken");
  });

  it("works with no cwd argument (home-only lookup)", () => {
    writeFileSync(join(homeDir, ".npmrc"), "//npm.pkg.github.com/:_authToken=ghp_onlyhome\n");
    expect(readGithubPackagesToken(homeDir)).toBe("ghp_onlyhome");
  });

  it("never throws on an unreadable/malformed file", () => {
    writeFileSync(join(homeDir, ".npmrc"), "not even npmrc shaped content\0\0\0");
    expect(() => readGithubPackagesToken(homeDir, cwdDir)).not.toThrow();
  });
});
