import { describe, expect, it, beforeAll, afterAll, beforeEach, afterEach } from "vitest";
import { createServer, type Server } from "node:http";
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runFeedback } from "../../src/commands/feedback.js";
import { writeSyncManifest } from "../../src/config/sync-manifest.js";

let server: Server;
let baseUrl: string;
let received: unknown[] = [];
let status = 201;
let errorBody: unknown = {};

beforeAll(async () => {
  server = createServer((req, res) => {
    let body = "";
    req.on("data", (chunk) => (body += chunk));
    req.on("end", () => {
      received.push(JSON.parse(body));
      res.writeHead(status, { "content-type": "application/json" });
      res.end(JSON.stringify(errorBody));
    });
  });
  await new Promise<void>((resolve) => server.listen(0, resolve));
  const address = server.address();
  baseUrl = `http://127.0.0.1:${typeof address === "object" && address ? address.port : 0}`;
});

afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

describe("runFeedback", () => {
  let dir: string;

  beforeEach(() => {
    received = [];
    status = 201;
    errorBody = {};
    dir = mkdtempSync(join(tmpdir(), "skillcanon-feedback-"));
    mkdirSync(join(dir, ".skillcanon"), { recursive: true });
    writeFileSync(join(dir, ".skillcanon", "project.json"), JSON.stringify({ server: baseUrl, projectId: "p" }), "utf8");
    writeFileSync(join(dir, ".skillcanon", "credentials.json"), JSON.stringify({ apiKey: "sk-test" }), { mode: 0o600 });
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it("files a signal for a bare rating", async () => {
    await runFeedback(dir, "serve-1", { down: true });
    expect(received).toEqual([{ serveId: "serve-1", kind: "signal", rating: "down" }]);
  });

  it("files a note, with the rating when given", async () => {
    await runFeedback(dir, "serve-1", { up: true, note: "great" });
    expect(received).toEqual([{ serveId: "serve-1", kind: "note", rating: "up", text: "great" }]);
  });

  it("resolves a slug to the serve its last run recorded", async () => {
    writeSyncManifest(dir, { stubs: {}, serves: { "release-notes": { serveId: "serve-9", version: "1", contentDigest: "d" } } });
    await runFeedback(dir, "release-notes", { up: true });
    expect(received).toEqual([{ serveId: "serve-9", kind: "signal", rating: "up" }]);
  });

  it("rejects nothing-to-say and both-ratings before any request", async () => {
    await expect(runFeedback(dir, "s", {})).rejects.toThrow(/rating/);
    await expect(runFeedback(dir, "s", { up: true, down: true })).rejects.toThrow(/not both/);
    expect(received).toEqual([]);
  });

  it("reports an unknown serve and a server-side validation message", async () => {
    status = 404;
    await expect(runFeedback(dir, "nope", { up: true })).rejects.toThrow('No serve found with id "nope"');
    status = 422;
    errorBody = { error: { message: "A note needs text." } };
    await expect(runFeedback(dir, "s", { up: true })).rejects.toThrow("A note needs text.");
  });
});
