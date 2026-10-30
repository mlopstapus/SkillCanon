/**
 * Drives the built `skillcanon` CLI (init, sync, run) against a running
 * instance. Runs after ui-walk (see sequencer.ts) and reuses the admin it
 * created. Everything else it needs (skill, project, key) it creates itself.
 * Point it elsewhere with E2E_BASE_URL.
 */
import { chromium, type Browser, type Page } from "playwright";
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const BASE = (process.env.E2E_BASE_URL ?? "http://localhost:3000").replace(/\/$/, "");
const ADMIN = { email: "e2e-admin@example.test", password: "e2e-local-password-1" };
const SLUG = "cli-smoke";
const BODY = "Greet the reader.";
const CHAIN = "cli-chain";
const POLICY = "Always cite the CLI smoke ticket number.";
const CLI = resolve("cli/dist/index.js");

let browser: Browser;
let page: Page;
let repo: string;
let projectId = "";
let apiKey = "";

const cli = (...args: string[]) =>
  execFileSync("node", [CLI, ...args], { cwd: repo, encoding: "utf8", });

async function api(method: string, path: string, body?: unknown) {
  const res = await page.request.fetch(`${BASE}${path}`, {
    method,
    headers: { "Content-Type": "application/json" },
    data: body === undefined ? undefined : JSON.stringify(body),
  });
  expect(res.status(), `${method} ${path}`).toBeLessThan(300);
  return res.json();
}

beforeAll(async () => {
  if (!existsSync(CLI)) execFileSync("pnpm", ["--dir", "cli", "run", "build"], { stdio: "inherit" });
  repo = mkdtempSync(join(tmpdir(), "skillcanon-cli-e2e-"));
  browser = await chromium.launch({ headless: !/^(0|false)$/i.test(process.env.PW_HEADLESS ?? "") });
  page = await browser.newPage();
  page.setDefaultTimeout(10_000);
});

afterAll(async () => {
  await browser?.close();
  if (repo) rmSync(repo, { recursive: true, force: true });
});

describe("skillcanon CLI", { timeout: 60_000 }, () => {
  it("sets up a project with an assigned skill and an API key", async () => {
    await page.goto(`${BASE}/login`);
    await page.getByLabel("Email").fill(ADMIN.email);
    await page.locator('input[type="password"]').fill(ADMIN.password);
    await page.getByRole("button", { name: "Sign in" }).click();
    await page.waitForURL("**/dashboard");

    const teams = await api("GET", "/api/teams");
    const teamId = (teams.items ?? teams)[0].id;
    const skill = await api("POST", "/api/skills", { name: SLUG });
    await api("POST", `/api/skills/${SLUG}/versions`, { version: "1.0.0", mainFile: { content: BODY } });
    // 015/003: a two-step chain over the same skill.
    await api("POST", "/api/skills", { name: CHAIN });
    await api("POST", `/api/skills/${CHAIN}/versions`, {
      version: "1.0.0",
      steps: [
        { id: "a", promptName: SLUG, dependsOn: [] },
        { id: "b", promptName: SLUG, dependsOn: ["a"] },
      ],
    });
    // A personally-owned skill can't be assigned to a project; hand it to the team.
    await api("POST", `/api/skills/${SLUG}/transfer`, { newOwnerType: "team", newOwnerId: teamId });
    await api("POST", "/api/policies", {
      teamId,
      name: "cli-smoke-policy",
      enforcementType: "append",
      content: POLICY,
    });
    const project = await api("POST", "/api/projects", {
      teamId,
      name: "CLI Smoke",
      slug: "cli-smoke",
    });
    projectId = project.id;
    await api("POST", `/api/projects/${projectId}/skills`, { skillId: skill.id, requirement: "required" });

    await page.goto(`${BASE}/settings/api-keys`);
    await page.getByRole("button", { name: "Issue key" }).first().click();
    const drawer = page.getByRole("dialog").filter({ visible: true });
    await drawer.getByPlaceholder("CI deploy key").fill("cli e2e key");
    await drawer.getByText("skills:read").click();
    await drawer.getByText("chains:run").click();
    await drawer.getByRole("button", { name: "Generate key" }).click();
    apiKey = ((await page.locator("span.break-all").textContent()) ?? "").trim();
    expect(apiKey).toMatch(/^sk_/);
  });

  it("init links the repo and syncs the project's skill", () => {
    const out = cli("init", "--project-key", `${BASE}/projects/${projectId}`, "--api-key", apiKey);
    expect(out).toMatch(/^Linked\. Synced \d+ skill/);
    // D1: the synced file is a stub, so no policy or template text is baked in.
    const synced = readFileSync(join(repo, ".claude/skills", `skillcanon-${SLUG}`, "SKILL.md"), "utf8");
    expect(synced).toContain(`skillcanon run ${SLUG}`);
    expect(synced).not.toContain(BODY);
    expect(synced).not.toMatch(/\{\{|\{%/);
    expect(existsSync(join(repo, ".skillcanon/project.json"))).toBe(true);
  });

  it("run starts a chain and advance steps it to completion", () => {
    const first = cli("run", CHAIN);
    expect(first).toContain("step 1");
    expect(first).toContain(BODY);
    const runId = /Chain run (\S+),/.exec(first)?.[1] ?? "";
    expect(runId).not.toBe("");
    const second = cli("advance", runId, "0", "--output", "done a");
    expect(second).toContain("step 2");
    expect(cli("advance", runId, "1")).toContain("complete");
  });

  it("sync is idempotent", () => {
    expect(cli("sync")).toContain("Already up to date.");
  });

  it("run resolves the skill live", () => {
    const out = cli("run", SLUG);
    expect(out).toContain(BODY);
    expect(out).toContain(POLICY); // governance reaches the model through `run`
  });
});
