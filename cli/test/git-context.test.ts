import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { readGitContext } from "../src/git-context.js";

const dirs: string[] = [];
const tmp = () => {
  const d = mkdtempSync(join(tmpdir(), "skillcanon-git-"));
  dirs.push(d);
  return d;
};
const git = (cwd: string, ...args: string[]) =>
  execFileSync("git", ["-c", "user.name=t", "-c", "user.email=t@t", ...args], { cwd, stdio: "ignore" });

afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

describe("readGitContext", () => {
  it("reads remote, branch and commit inside a real repo", () => {
    const dir = tmp();
    git(dir, "init", "-q", "-b", "feature-x");
    git(dir, "remote", "add", "origin", "https://user:secret@github.com/acme/repo.git");
    writeFileSync(join(dir, "f"), "x");
    git(dir, "add", ".");
    git(dir, "commit", "-q", "-m", "init");
    const ctx = readGitContext(dir);
    expect(ctx.gitBranch).toBe("feature-x");
    expect(ctx.gitCommitSha).toMatch(/^[0-9a-f]{40}$/);
    expect(ctx.gitRemoteUrl).toBe("https://github.com/acme/repo.git");
    expect(JSON.stringify(ctx)).not.toContain("secret");
  });

  it("returns nulls outside a repo, without a remote, and before the first commit", () => {
    expect(readGitContext(tmp())).toEqual({ gitRemoteUrl: null, gitBranch: null, gitCommitSha: null });
    const dir = tmp();
    git(dir, "init", "-q");
    expect(readGitContext(dir).gitRemoteUrl).toBeNull();
    expect(readGitContext(dir).gitCommitSha).toBeNull();
  });
});
