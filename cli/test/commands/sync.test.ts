import { describe, expect, it, beforeAll, afterAll, beforeEach, afterEach } from "vitest";
import { createServer, type Server, type IncomingMessage, type ServerResponse } from "node:http";
import { mkdtempSync, rmSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Command } from "commander";
import { runInit } from "../../src/commands/init.js";
import { runSync, registerSyncCommand } from "../../src/commands/sync.js";

let server: Server;
let baseUrl: string;
let roster: Array<{ name: string; description: string | null }> = [];
let failRequests = false;

function handler(req: IncomingMessage, res: ServerResponse) {
  if (req.url?.startsWith("/api/skills?")) {
    if (failRequests) {
      res.writeHead(401, { "content-type": "application/json" });
      res.end(JSON.stringify({ error: "unauthorized" }));
      return;
    }
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ items: roster }));
    return;
  }
  res.writeHead(404, { "content-type": "application/json" });
  res.end(JSON.stringify({ error: "not found" }));
}

beforeAll(async () => {
  server = createServer(handler);
  await new Promise<void>((resolve) => server.listen(0, resolve));
  const address = server.address();
  const port = typeof address === "object" && address ? address.port : 0;
  baseUrl = `http://127.0.0.1:${port}`;
});

afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

const projectKey = () => `${baseUrl}/projects/3fa85f64-5717-4562-b3fc-2c963f66afa6`;

describe("runSync (manual invocation parity, US2)", () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "skillcanon-sync-"));
    failRequests = false;
    roster = [{ name: "Release Notes", description: "Drafts release notes." }];
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it("a manually-invoked sync after init re-confirms (not re-creates) an unchanged prompt, idempotently", async () => {
    await runInit(dir, { projectKey: projectKey(), apiKey: "sk-test" });
    const second = await runSync(dir);
    // Always re-writes from the live roster (read-fresh, never a no-op
    // skip) — so an unchanged prompt is reported as "updated" (same
    // resulting content/hash), never re-"created" and never a conflict.
    expect(second).toEqual({ created: [], updated: ["release-notes"], removed: [], conflicts: [] });
  });

  it("a manually-invoked sync reflects a server-side change immediately, same as init's own first sync", async () => {
    await runInit(dir, { projectKey: projectKey(), apiKey: "sk-test" });
    roster = [{ name: "Release Notes", description: "Updated description." }, { name: "New Prompt", description: "" }];
    const result = await runSync(dir);
    expect(result.created).toEqual(["new-prompt"]);
    expect(result.updated).toEqual(["release-notes"]);
  });
});

describe("runSync (hand-edit conflict + --force, US3)", () => {
  let dir: string;

  beforeEach(async () => {
    dir = mkdtempSync(join(tmpdir(), "skillcanon-sync-force-"));
    failRequests = false;
    roster = [{ name: "Release Notes", description: "Drafts release notes." }];
    await runInit(dir, { projectKey: projectKey(), apiKey: "sk-test" });
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it("skips and flags a hand-edited stub without --force, leaving it untouched", async () => {
    const stubPath = join(dir, ".claude", "skills", "skillcanon-release-notes", "SKILL.md");
    const original = readFileSync(stubPath, "utf8");
    writeFileSync(stubPath, "hand-edited content", "utf8");

    roster = [{ name: "Release Notes", description: "Changed upstream." }];
    const result = await runSync(dir);

    expect(result.conflicts).toEqual([{ slug: "release-notes", reason: "hand-edited" }]);
    expect(readFileSync(stubPath, "utf8")).toBe("hand-edited content");
    expect(readFileSync(stubPath, "utf8")).not.toBe(original);
  });

  it("--force overwrites the hand-edited stub with the current upstream content", async () => {
    const stubPath = join(dir, ".claude", "skills", "skillcanon-release-notes", "SKILL.md");
    writeFileSync(stubPath, "hand-edited content", "utf8");

    roster = [{ name: "Release Notes", description: "Changed upstream." }];
    const result = await runSync(dir, { force: true });

    expect(result.conflicts).toEqual([]);
    expect(result.updated).toEqual(["release-notes"]);
    expect(readFileSync(stubPath, "utf8")).toContain("Changed upstream.");
  });
});

describe("runSync (request-level failure, US3)", () => {
  let dir: string;

  beforeEach(async () => {
    dir = mkdtempSync(join(tmpdir(), "skillcanon-sync-fail-"));
    failRequests = false;
    roster = [{ name: "Release Notes", description: "Drafts release notes." }];
    await runInit(dir, { projectKey: projectKey(), apiKey: "sk-test" });
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it("leaves the roster and manifest completely untouched on a request-level failure", async () => {
    const manifestBefore = readFileSync(join(dir, ".skillcanon", "sync-manifest.json"), "utf8");
    failRequests = true;
    await expect(runSync(dir)).rejects.toThrow();
    const manifestAfter = readFileSync(join(dir, ".skillcanon", "sync-manifest.json"), "utf8");
    expect(manifestAfter).toBe(manifestBefore);
    expect(existsSync(join(dir, ".claude", "skills", "skillcanon-release-notes", "SKILL.md"))).toBe(true);
  });
});

describe("registerSyncCommand (--quiet, FR-013, US3)", () => {
  let dir: string;
  let originalCwd: string;

  beforeEach(async () => {
    dir = mkdtempSync(join(tmpdir(), "skillcanon-sync-quiet-"));
    originalCwd = process.cwd();
    failRequests = false;
    roster = [{ name: "Release Notes", description: "Drafts release notes." }];
    await runInit(dir, { projectKey: projectKey(), apiKey: "sk-test" });
    process.chdir(dir);
  });

  afterEach(() => {
    process.chdir(originalCwd);
    rmSync(dir, { recursive: true, force: true });
  });

  it("a manual (non-quiet) sync throws on request-level failure", async () => {
    failRequests = true;
    await expect(runSync(dir)).rejects.toThrow();
  });

  it("`sync --quiet` never throws out of the command action on the same failure — warns instead", async () => {
    failRequests = true;
    const program = new Command();
    registerSyncCommand(program);
    await expect(program.parseAsync(["node", "skillcanon", "sync", "--quiet"])).resolves.toBeDefined();
  });
});
