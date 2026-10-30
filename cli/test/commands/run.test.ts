import { describe, expect, it, beforeAll, afterAll, beforeEach, afterEach } from "vitest";
import { createServer, type Server, type IncomingMessage, type ServerResponse } from "node:http";
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runAdvance, runRun } from "../../src/commands/run.js";
import { AuthError, NetworkError, NotFoundError } from "../../src/http/skillcanon-client.js";

let server: Server;
let baseUrl: string;
let expandResponse: { content: string; appliedPolicies: string[]; objectives: string[] };

function handler(req: IncomingMessage, res: ServerResponse) {
  if (req.url === "/api/skills/release-notes/expand") {
    if (req.headers.authorization === "Bearer sk-bad") {
      res.writeHead(401, { "content-type": "application/json" });
      res.end(JSON.stringify({ error: "unauthorized" }));
      return;
    }
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify(expandResponse));
    return;
  }
  if (req.url === "/api/skills/deleted-skill/expand") {
    res.writeHead(404, { "content-type": "application/json" });
    res.end(JSON.stringify({ error: "not found" }));
    return;
  }
  res.writeHead(500, { "content-type": "application/json" });
  res.end(JSON.stringify({ error: "boom" }));
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

function setUpLinkedRepo(dir: string, apiKey = "sk-test"): void {
  mkdirSync(join(dir, ".skillcanon"), { recursive: true });
  writeFileSync(
    join(dir, ".skillcanon", "project.json"),
    JSON.stringify({ server: baseUrl, projectId: "3fa85f64-5717-4562-b3fc-2c963f66afa6" }),
    "utf8",
  );
  writeFileSync(join(dir, ".skillcanon", "credentials.json"), JSON.stringify({ apiKey }), { mode: 0o600 });
}

describe("runRun", () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "skillcanon-run-"));
    setUpLinkedRepo(dir);
    expandResponse = { content: "Resolved skill content.", appliedPolicies: [], objectives: [] };
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it("prints the resolved content, nothing else", async () => {
    const text = await runRun(dir, "release-notes");
    expect(text).toBe("Resolved skill content.");
  });

  it("reflects a change in the server's response on the very next call (no caching)", async () => {
    const first = await runRun(dir, "release-notes");
    expandResponse = { ...expandResponse, content: "Updated after a policy change." };
    const second = await runRun(dir, "release-notes");
    expect(first).not.toBe(second);
    expect(second).toContain("Updated after a policy change.");
  });

  it("fails with AuthError on an invalid/expired credential, no stdout content produced", async () => {
    setUpLinkedRepo(dir, "sk-bad");
    await expect(runRun(dir, "release-notes")).rejects.toThrow(AuthError);
  });

  it("fails with NotFoundError on a deleted prompt", async () => {
    await expect(runRun(dir, "deleted-skill")).rejects.toThrow(NotFoundError);
  });

  it("fails with NetworkError when the server is unreachable", async () => {
    writeFileSync(
      join(dir, ".skillcanon", "project.json"),
      JSON.stringify({ server: "http://127.0.0.1:1", projectId: "x" }),
      "utf8",
    );
    await expect(runRun(dir, "release-notes")).rejects.toThrow(NetworkError);
  });

  it("each failure mode produces a distinct error message", async () => {
    setUpLinkedRepo(dir, "sk-bad");
    let authMessage = "";
    try {
      await runRun(dir, "release-notes");
    } catch (err) {
      authMessage = (err as Error).message;
    }

    setUpLinkedRepo(dir);
    let notFoundMessage = "";
    try {
      await runRun(dir, "deleted-skill");
    } catch (err) {
      notFoundMessage = (err as Error).message;
    }

    expect(authMessage).not.toBe(notFoundMessage);
    expect(authMessage.length).toBeGreaterThan(0);
    expect(notFoundMessage.length).toBeGreaterThan(0);
  });
});

describe("runRun / runAdvance with a chain skill (015/003)", () => {
  let chainServer: Server;
  let chainUrl: string;
  const calls: string[] = [];

  beforeAll(async () => {
    chainServer = createServer((req, res) => {
      let body = "";
      req.on("data", (c) => (body += c));
      req.on("end", () => {
        calls.push(`${req.method} ${req.url} ${body}`);
        const send = (status: number, json: unknown) => {
          res.writeHead(status, { "content-type": "application/json" });
          res.end(JSON.stringify(json));
        };
        if (req.url === "/api/skills/ship-it/expand") return send(404, {});
        if (req.url === "/api/skills/ship-it") return send(200, { activeVersionId: "v1" });
        if (req.url === "/api/skills/ship-it/versions") return send(200, [{ id: "v1", kind: "chain", files: [] }]);
        const step = (i: number) => ({
          step: { stepId: "ab"[i], stepIndex: i, promptName: "p", promptVersion: "1", content: `content ${i}` },
        });
        if (req.url === "/api/skills/ship-it/chain-runs") return send(201, { runId: "run-1", ...step(0) });
        if (req.url === "/api/chain-runs/run-1/advance") {
          return send(200, JSON.parse(body).stepIndex === 0 ? step(1) : { done: true });
        }
        send(500, {});
      });
    });
    await new Promise<void>((resolve) => chainServer.listen(0, resolve));
    const address = chainServer.address();
    chainUrl = `http://127.0.0.1:${typeof address === "object" && address ? address.port : 0}`;
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => chainServer.close(() => resolve()));
  });

  it("starts a run and prints step 1 with the advance command, then steps on to done", async () => {
    const dir = mkdtempSync(join(tmpdir(), "skillcanon-run-chain-"));
    mkdirSync(join(dir, ".skillcanon"), { recursive: true });
    writeFileSync(join(dir, ".skillcanon", "project.json"), JSON.stringify({ server: chainUrl, projectId: "p" }), "utf8");
    writeFileSync(join(dir, ".skillcanon", "credentials.json"), JSON.stringify({ apiKey: "sk-test" }), { mode: 0o600 });
    try {
      const first = await runRun(dir, "ship-it");
      expect(first).toContain("step 1");
      expect(first).toContain("content 0");
      expect(first).toContain("skillcanon advance run-1 0");

      const second = await runAdvance(dir, "run-1", { stepIndex: 0, status: "success", output: "ok" });
      expect(second).toContain("content 1");
      expect(calls.some((c) => c.includes('"stepIndex":0') && c.includes('"output":"ok"'))).toBe(true);

      expect(await runAdvance(dir, "run-1", { stepIndex: 1, status: "success" })).toContain("complete");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
