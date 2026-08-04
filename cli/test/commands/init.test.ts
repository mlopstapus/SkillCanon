import { describe, expect, it, beforeAll, afterAll, beforeEach, afterEach } from "vitest";
import { createServer, type Server, type IncomingMessage, type ServerResponse } from "node:http";
import { mkdtempSync, rmSync, readFileSync, existsSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runInit } from "../../src/commands/init.js";

let server: Server;
let baseUrl: string;
let roster: Array<{ name: string; description: string | null }> = [];

function handler(req: IncomingMessage, res: ServerResponse) {
  if (req.url?.startsWith("/api/skills?")) {
    if (req.headers.authorization === "Bearer sk-bad") {
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

describe("runInit", () => {
  let dir: string;
  const projectKey = () => `${baseUrl}/projects/3fa85f64-5717-4562-b3fc-2c963f66afa6`;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "skillcanon-init-"));
    roster = [
      { name: "Release Notes", description: "Drafts release notes." },
      { name: "Bug Triage", description: "Triages incoming bugs." },
    ];
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it("writes project.json, credentials.json (0600), .gitignore entry, .claude/settings.json hook, agent-doc blurbs, and stubs for every roster prompt", async () => {
    await runInit(dir, { projectKey: projectKey(), apiKey: "sk-test" });

    const link = JSON.parse(readFileSync(join(dir, ".skillcanon", "project.json"), "utf8"));
    expect(link).toEqual({ server: baseUrl, projectId: "3fa85f64-5717-4562-b3fc-2c963f66afa6" });

    const credsPath = join(dir, ".skillcanon", "credentials.json");
    expect(JSON.parse(readFileSync(credsPath, "utf8"))).toEqual({ apiKey: "sk-test" });
    expect(statSync(credsPath).mode & 0o777).toBe(0o600);

    expect(readFileSync(join(dir, ".gitignore"), "utf8")).toContain(".skillcanon/credentials.json");

    const settings = JSON.parse(readFileSync(join(dir, ".claude", "settings.json"), "utf8"));
    expect(settings.hooks.SessionStart[0].hooks[0].command).toBe("skillcanon sync --quiet");

    expect(readFileSync(join(dir, "CLAUDE.md"), "utf8")).toContain("SkillCanon");
    expect(readFileSync(join(dir, "AGENTS.md"), "utf8")).toContain("SkillCanon");

    expect(existsSync(join(dir, ".claude", "skills", "skillcanon-release-notes", "SKILL.md"))).toBe(true);
    expect(existsSync(join(dir, ".claude", "skills", "skillcanon-bug-triage", "SKILL.md"))).toBe(true);
  });

  it("is idempotent on re-run: no duplicated hook entries, blurbs, or gitignore lines", async () => {
    await runInit(dir, { projectKey: projectKey(), apiKey: "sk-test" });
    await runInit(dir, { projectKey: projectKey(), apiKey: "sk-test-2" });

    const settings = JSON.parse(readFileSync(join(dir, ".claude", "settings.json"), "utf8"));
    expect(settings.hooks.SessionStart).toHaveLength(1);

    const gitignore = readFileSync(join(dir, ".gitignore"), "utf8");
    expect(gitignore.split(".skillcanon/credentials.json").length - 1).toBe(1);

    const claudeMd = readFileSync(join(dir, "CLAUDE.md"), "utf8");
    expect(claudeMd.split("<!-- skillcanon:start -->").length - 1).toBe(1);

    expect(JSON.parse(readFileSync(join(dir, ".skillcanon", "credentials.json"), "utf8")).apiKey).toBe("sk-test-2");
  });

  it("rejects a malformed project key without writing any config", async () => {
    await expect(runInit(dir, { projectKey: "not-a-url", apiKey: "sk-test" })).rejects.toThrow();
    expect(existsSync(join(dir, ".skillcanon"))).toBe(false);
  });

  it("rejects an invalid API key (auth failure) without writing any config", async () => {
    await expect(runInit(dir, { projectKey: projectKey(), apiKey: "sk-bad" })).rejects.toThrow();
    expect(existsSync(join(dir, ".skillcanon"))).toBe(false);
  });
});
