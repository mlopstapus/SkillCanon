import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createServer, type Server } from "node:http";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { evalPassed, formatEvalRun, runEval } from "../../src/commands/eval.js";

let server: Server;
let baseUrl: string;
let calls: Array<{ method: string; url: string; auth: string | undefined; body: string }> = [];
let statuses: string[] = [];
let httpStatus = 202;

beforeAll(async () => {
  server = createServer((req, res) => {
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", () => {
      calls.push({ method: req.method ?? "", url: req.url ?? "", auth: req.headers.authorization, body });
      const status = req.method === "POST" ? "queued" : (statuses.shift() ?? "succeeded");
      res.writeHead(httpStatus, { "content-type": "application/json" });
      res.end(
        httpStatus >= 400
          ? JSON.stringify({ error: { message: "Evals are not enabled for this organization." } })
          : JSON.stringify({ id: "run-1", status, error: null, models: ["m/a"], results: status === "succeeded" ? [{ model: "m/a", caseId: "c1", passed: true, scorePct: 100, error: null }] : [] }),
      );
    });
  });
  await new Promise<void>((r) => server.listen(0, r));
  const a = server.address();
  baseUrl = `http://127.0.0.1:${typeof a === "object" && a ? a.port : 0}`;
});
afterAll(() => new Promise<void>((r) => server.close(() => r())));

describe("runEval", () => {
  let dir: string;
  beforeEach(() => {
    calls = [];
    statuses = [];
    httpStatus = 202;
    dir = mkdtempSync(join(tmpdir(), "skillcanon-eval-"));
    mkdirSync(join(dir, ".skillcanon"), { recursive: true });
    writeFileSync(join(dir, ".skillcanon", "project.json"), JSON.stringify({ server: baseUrl, projectId: "p" }));
    writeFileSync(join(dir, ".skillcanon", "credentials.json"), JSON.stringify({ apiKey: "sk-test" }), { mode: 0o600 });
  });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  it("submits with the api key and no provider keys, returning the queued run", async () => {
    const run = await runEval(dir, "my-skill", "1.0.0", { models: "m/a, m/b", judge: "m/j" });
    expect(run.status).toBe("queued");
    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject({ method: "POST", url: "/api/skills/my-skill/versions/1.0.0/evals", auth: "Bearer sk-test" });
    expect(JSON.parse(calls[0]!.body)).toEqual({ models: ["m/a", "m/b"], judge: "m/j" });
  });

  it("--wait polls until the run finishes", async () => {
    statuses = ["running", "succeeded"];
    const run = await runEval(dir, "my-skill", "1.0.0", { models: "m/a", wait: true, pollMs: 1 });
    expect(run.status).toBe("succeeded");
    expect(calls.map((c) => c.method)).toEqual(["POST", "GET", "GET"]);
    expect(evalPassed(run)).toBe(true);
    expect(formatEvalRun(run)).toContain("m/a  c1  pass 100%");
  });

  it("surfaces the server's message on a 409", async () => {
    httpStatus = 409;
    await expect(runEval(dir, "s", "1", { models: "m/a" })).rejects.toThrow("not enabled");
  });

  it("requires at least one model", async () => {
    await expect(runEval(dir, "s", "1", { models: " , " })).rejects.toThrow("--models");
  });
});
