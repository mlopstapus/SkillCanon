import { execFileSync } from "node:child_process";
import { createServer, type Server } from "node:http";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { runRun } from "../../src/commands/run.js";

let server: Server;
let baseUrl: string;
let lastBody: Record<string, unknown> = {};

beforeAll(async () => {
  server = createServer((req, res) => {
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", () => {
      lastBody = JSON.parse(body || "{}");
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ content: "ok", appliedPolicies: [], objectives: [] }));
    });
  });
  await new Promise<void>((resolve) => server.listen(0, resolve));
  const address = server.address();
  baseUrl = `http://127.0.0.1:${typeof address === "object" && address ? address.port : 0}`;
});
afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

function linkedDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "skillcanon-run-git-"));
  mkdirSync(join(dir, ".skillcanon"), { recursive: true });
  writeFileSync(join(dir, ".skillcanon", "project.json"), JSON.stringify({ server: baseUrl, projectId: "p" }));
  writeFileSync(join(dir, ".skillcanon", "credentials.json"), JSON.stringify({ apiKey: "sk-test" }), { mode: 0o600 });
  return dir;
}

describe("run tags the invocation with git context (011/004)", () => {
  it("sends remote, branch and commit from inside a git repo", async () => {
    const dir = linkedDir();
    try {
      const git = (...a: string[]) => execFileSync("git", ["-c", "user.name=t", "-c", "user.email=t@t", ...a], { cwd: dir, stdio: "ignore" });
      git("init", "-q", "-b", "topic");
      git("remote", "add", "origin", "git@github.com:acme/repo.git");
      writeFileSync(join(dir, "f"), "x");
      git("add", "f");
      git("commit", "-q", "-m", "c");
      await runRun(dir, "release-notes");
      expect(lastBody).toMatchObject({ gitRemoteUrl: "git@github.com:acme/repo.git", gitBranch: "topic" });
      expect(String(lastBody.gitCommitSha)).toMatch(/^[0-9a-f]{40}$/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("sends no git fields outside a repo and still succeeds", async () => {
    const dir = linkedDir();
    try {
      expect(await runRun(dir, "release-notes")).toBe("ok");
      expect(lastBody).toEqual({});
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
