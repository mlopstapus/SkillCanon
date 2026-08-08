import { describe, expect, it, beforeAll, afterAll, beforeEach, afterEach } from "vitest";
import { createServer, type Server, type IncomingMessage, type ServerResponse } from "node:http";
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runRun } from "../../src/commands/run.js";
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
