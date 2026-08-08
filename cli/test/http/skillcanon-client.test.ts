import { describe, expect, it, beforeAll, afterAll } from "vitest";
import { createServer, type Server, type IncomingMessage, type ServerResponse } from "node:http";
import { AuthError, ApiError, NetworkError, NotFoundError, expandSkill, listSkills } from "../../src/http/skillcanon-client.js";

let server: Server;
let baseUrl: string;
let lastAuthHeader: string | undefined;
let lastUrl: string | undefined;
let lastBody: string | undefined;

function handler(req: IncomingMessage, res: ServerResponse) {
  lastAuthHeader = req.headers.authorization;
  lastUrl = req.url;

  let raw = "";
  req.on("data", (chunk) => (raw += chunk));
  req.on("end", () => {
    lastBody = raw;

    if (req.url?.startsWith("/api/skills?")) {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ items: [{ name: "release-notes", description: "Drafts release notes." }] }));
      return;
    }
    if (req.url === "/api/skills/good-slug/expand") {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ content: "resolved", appliedPolicies: [], objectives: [] }));
      return;
    }
    if (req.url === "/api/skills/unauthorized/expand") {
      res.writeHead(401, { "content-type": "application/json" });
      res.end(JSON.stringify({ error: "unauthorized" }));
      return;
    }
    if (req.url === "/api/skills/missing/expand") {
      res.writeHead(404, { "content-type": "application/json" });
      res.end(JSON.stringify({ error: "not found" }));
      return;
    }
    res.writeHead(500, { "content-type": "application/json" });
    res.end(JSON.stringify({ error: "boom" }));
  });
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

describe("listSkills", () => {
  it("sends Authorization: Bearer and ?projectId= and returns the roster", async () => {
    const skills = await listSkills({ server: baseUrl, apiKey: "sk-test" }, "proj-1");
    expect(lastAuthHeader).toBe("Bearer sk-test");
    expect(lastUrl).toContain("projectId=proj-1");
    expect(skills).toEqual([{ name: "release-notes", description: "Drafts release notes." }]);
  });
});

describe("expandSkill", () => {
  it("POSTs no body fields (no `input` — 032-skill-file-format-refactor) and returns the expansion result", async () => {
    const result = await expandSkill({ server: baseUrl, apiKey: "sk-test" }, "good-slug");
    expect(JSON.parse(lastBody ?? "{}")).toEqual({});
    expect(result).toEqual({ content: "resolved", appliedPolicies: [], objectives: [] });
  });

  it("throws AuthError on 401, with no mention of the api key", async () => {
    await expect(expandSkill({ server: baseUrl, apiKey: "sk-test" }, "unauthorized")).rejects.toThrow(AuthError);
    try {
      await expandSkill({ server: baseUrl, apiKey: "sk-test" }, "unauthorized");
    } catch (err) {
      expect((err as Error).message).not.toContain("sk-test");
    }
  });

  it("throws NotFoundError on 404", async () => {
    await expect(expandSkill({ server: baseUrl, apiKey: "sk-test" }, "missing")).rejects.toThrow(NotFoundError);
  });

  it("throws ApiError on other non-2xx responses", async () => {
    await expect(expandSkill({ server: baseUrl, apiKey: "sk-test" }, "boom")).rejects.toThrow(ApiError);
  });

  it("throws NetworkError when the server is unreachable", async () => {
    await expect(expandSkill({ server: "http://127.0.0.1:1", apiKey: "sk-test" }, "x")).rejects.toThrow(NetworkError);
  });
});
