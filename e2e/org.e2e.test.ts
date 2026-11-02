/**
 * Runs `pnpm import:org` (019/001) against a running instance with the fictional
 * roster in e2e/fixtures/org/, then checks the resulting tree over REST and in the
 * Teams page. Runs after ui-walk (see sequencer.ts) and reuses the admin it
 * created. Point it elsewhere with E2E_BASE_URL.
 */
import { chromium, type Browser, type Page } from "playwright";
import { execFileSync } from "node:child_process";
import { cpSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const BASE = (process.env.E2E_BASE_URL ?? "http://localhost:3000").replace(/\/$/, "");
const ADMIN = { email: "e2e-admin@example.test", password: "e2e-local-password-1" };
const SCRIPT = resolve("scripts/import-org.mjs");

let browser: Browser;
let page: Page;
let dir: string;
let rootSlug = "";
const importOrg = () =>
  execFileSync(
    "node",
    [SCRIPT, "--roster", join(dir, "roster.csv"), "--teams", join(dir, "teams.json"), "--server", BASE, "--api-key-file", join(dir, "key"), "--root-team", rootSlug],
    { encoding: "utf8" },
  );

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
  dir = mkdtempSync(join(tmpdir(), "skillcanon-org-e2e-"));
  cpSync(resolve("e2e/fixtures/org"), dir, { recursive: true });
  browser = await chromium.launch({ headless: !/^(0|false)$/i.test(process.env.PW_HEADLESS ?? "") });
  page = await browser.newPage();
  page.setDefaultTimeout(10_000);
});

afterAll(async () => {
  await browser?.close();
  if (dir) rmSync(dir, { recursive: true, force: true });
});

describe("roster import", { timeout: 90_000 }, () => {
  it("imports the fictional roster, building the tree with owners, Executive and a Squad team", async () => {
    await page.goto(`${BASE}/login`);
    await page.getByLabel("Email").fill(ADMIN.email);
    await page.locator('input[type="password"]').fill(ADMIN.password);
    await page.getByRole("button", { name: "Sign in" }).click();
    await page.waitForURL("**/dashboard");

    const users = await api("GET", "/api/users?pageSize=100");
    const admin = users.items.find((u: { email: string }) => u.email === ADMIN.email);
    const key = await api("POST", `/api/users/${admin.id}/api-keys`, { name: "org e2e key", scopes: ["teams:write"] });
    writeFileSync(join(dir, "key"), key.key ?? key.rawKey ?? key.apiKey);

    const teams = await api("GET", "/api/teams?pageSize=100");
    rootSlug = teams.items.find((t: { parentTeamId: string | null }) => !t.parentTeamId).slug;

    const out = importOrg();
    expect(out).toContain("Teams: 5 created");
    expect(out).toContain("People: 25 created");
    expect(out).toContain("Squad: Gus Penn");

    const after = (await api("GET", "/api/teams?pageSize=100")).items as Array<{ id: string; slug: string; name: string; parentTeamId: string | null; ownerId: string | null }>;
    const byName = (name: string) => after.find((t) => t.name === name)!;
    const everyone = (await api("GET", "/api/users?pageSize=100")).items as Array<{ id: string; email: string; teamId: string }>;
    const email = (id: string | null) => everyone.find((u) => u.id === id)?.email;

    expect(byName("Executive").parentTeamId).toBe(after.find((t) => t.slug === rootSlug)!.id);
    expect(email(byName("Executive").ownerId)).toBe("avery.quill@example.test");
    expect(byName("Talent").parentTeamId).toBe(byName("Executive").id);
    expect(byName("Recruiting").parentTeamId).toBe(byName("Talent").id);
    expect(byName("Squad: Gus Penn").parentTeamId).toBe(byName("Engineering & Product").id);
    expect(email(byName("Squad: Gus Penn").ownerId)).toBe("gus.penn@example.test");
    const gus = everyone.find((u) => u.email === "gus.penn@example.test")!;
    expect(gus.teamId).toBe(byName("Squad: Gus Penn").id);
  });

  it("is idempotent: a second run changes nothing", () => {
    const out = importOrg();
    expect(out).toContain("Teams: 0 created, 0 updated, 5 unchanged");
    expect(out).toContain("People: 0 created, 0 moved, 25 unchanged");
  });

  it("shows the imported teams on the Teams page", async () => {
    await page.goto(`${BASE}/teams`);
    await expect.poll(() => page.getByText("Squad: Gus Penn").first().isVisible()).toBe(true);
    await expect.poll(() => page.getByText("Executive", { exact: true }).first().isVisible()).toBe(true);
  });
});
