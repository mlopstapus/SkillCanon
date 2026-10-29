/**
 * Walks every page of the web UI and its main actions in a real browser, then
 * checks that what the UI created can be fetched over REST and MCP.
 *
 * Needs a FRESH instance — the first test runs first-run setup, which only
 * works once per database. Run with `pnpm test:e2e`; point it elsewhere with
 * E2E_BASE_URL. Tests run in order and share one signed-in page.
 *
 * `it.fails` marks a known defect (see backlog/015-distribution-correctness):
 * it passes while the bug exists and fails once it is fixed, so flip it to `it`.
 */
import { chromium, type Browser, type Page } from "playwright";
import { mkdir } from "node:fs/promises";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

const BASE = (process.env.E2E_BASE_URL ?? "http://localhost:3000").replace(
  /\/$/,
  "",
);
const ADMIN = {
  name: "E2E Admin",
  username: "e2eadmin",
  email: "e2e-admin@example.test",
  password: "e2e-local-password-1",
};
const SKILL = "release-notes";
const POLICY = {
  name: "cite-pr-numbers",
  content: "Always cite the pull request number.",
};
const PROJECT = "Docs Site";

let browser: Browser;
let page: Page;
let apiKey = "";
const pageErrors: string[] = [];

// Closed drawers stay mounted on some pages, so only the visible one counts.
const drawer = () => page.getByRole("dialog").filter({ visible: true });
const nav = () => page.getByRole("navigation", { name: "Primary" });

/** Page errors raised since the last call, so each test asserts only its own. */
let seenErrors = 0;
function newPageErrors(): string[] {
  const fresh = pageErrors.slice(seenErrors);
  seenErrors = pageErrors.length;
  return fresh;
}

async function goto(path: string) {
  await page.goto(`${BASE}${path}`);
}

async function openSkill(name: string) {
  await goto(`/prompts/${name}`);
  await expect
    .poll(() => page.getByText(name, { exact: true }).first().isVisible())
    .toBe(true);
}

beforeAll(async () => {
  browser = await chromium.launch({
    headless: !/^(0|false)$/i.test(process.env.PW_HEADLESS ?? ""),
  });
  page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  page.setDefaultTimeout(10_000);
  page.on("pageerror", (err) =>
    pageErrors.push(`${page.url()}: ${err.message.split("\n")[0]}`),
  );
});

afterEach(async (ctx) => {
  if (ctx.task.result?.state !== "fail" || ctx.task.fails || !page) return;
  await mkdir("artifacts/e2e", { recursive: true });
  await page.screenshot({
    path: `artifacts/e2e/${ctx.task.name.replace(/\W+/g, "-")}.png`,
    fullPage: true,
  });
});

afterAll(async () => {
  await browser?.close();
});

describe("SkillCanon UI walk", { timeout: 60_000 }, () => {
  it("serves the landing page and sends a signed-out visitor to sign-in", async () => {
    await goto("/");
    await expect
      .poll(() => page.getByRole("heading", { level: 1 }).textContent())
      .toMatch(/Govern every/);
    await goto("/dashboard");
    await page.waitForURL("**/login");
  });

  it("toggles the landing page theme", async () => {
    await goto("/");
    const isLight = () => page.locator('[data-theme="light"]').count();
    const before = await isLight();
    await page.getByRole("button", { name: "Toggle theme" }).click();
    await expect.poll(isLight).not.toBe(before);
  });

  it("creates the instance through first-run setup", async () => {
    await goto("/register");
    await page.getByPlaceholder("Acme Ops").fill("Example Org");
    await page.getByPlaceholder("Platform").fill("Platform");
    await page.getByPlaceholder("Jane Doe").fill(ADMIN.name);
    await page.getByPlaceholder("jane", { exact: true }).fill(ADMIN.username);
    await page.getByPlaceholder("jane@example.com").fill(ADMIN.email);
    await page.locator('input[type="password"]').fill(ADMIN.password);
    await page.getByText("Create instance", { exact: true }).click();
    await page.waitForURL("**/welcome");
    await expect
      .poll(() => page.getByText(`Welcome, ${ADMIN.name}.`).isVisible())
      .toBe(true);
    await page.getByText("Enter SkillCanon").click();
    await page.waitForURL("**/dashboard");
  });

  it("opens every page in the navigation without a page error", async () => {
    const pages: [string, RegExp][] = [
      ["Overview", /\/dashboard$/],
      ["Skills", /\/prompts$/],
      ["Teams", /\/teams$/],
      ["Governance", /\/teams\/[^/]+\/policies$/],
      ["Projects", /\/projects$/],
      ["Metrics", /\/metrics$/],
      ["API keys", /\/settings\/api-keys$/],
    ];
    for (const [label, url] of pages) {
      await nav().getByRole("link", { name: label }).click();
      await page.waitForURL(url);
      await page.waitForLoadState("networkidle");
    }
    expect(newPageErrors()).toEqual([]);
  });

  it("creates a sub-team and finds it with the team filter", async () => {
    await goto("/teams");
    await page.getByRole("button", { name: "New sub-team" }).first().click();
    await drawer().getByPlaceholder("Data Platform").fill("Data Platform");
    await drawer().getByPlaceholder("data-platform").fill("data-platform");
    await drawer().getByPlaceholder("What this team owns…").fill("Pipelines");
    await drawer().getByRole("button", { name: "Create team" }).click();
    await expect.poll(() => drawer().count()).toBe(0);
    await page.getByPlaceholder("Filter teams").fill("Data");
    await expect
      .poll(() =>
        page
          .getByRole("navigation", { name: "Team hierarchy" })
          .getByText("Data Platform")
          .isVisible(),
      )
      .toBe(true);
  });

  it("opens the invite-by-email drawer from the team's members tab", async () => {
    await goto("/teams");
    await page.getByRole("button", { name: "Members" }).click();
    await page.getByRole("button", { name: "+ invite by email" }).click();
    await expect
      .poll(() => drawer().getByPlaceholder("jamie@example.com").isVisible())
      .toBe(true);
    await drawer().getByRole("button", { name: "Close" }).click();
  });

  it("creates a policy and an objective at the root team", async () => {
    await nav().getByRole("link", { name: "Governance" }).click();
    await page.waitForURL(/\/policies$/);
    await page.getByRole("button", { name: "New policy" }).first().click();
    await drawer().getByPlaceholder("require-typed-errors").fill(POLICY.name);
    await drawer()
      .getByPlaceholder(/Describe the rule/)
      .fill(POLICY.content);
    await drawer().getByRole("button", { name: "Create policy" }).click();
    await expect
      .poll(() => page.getByText(POLICY.name, { exact: true }).isVisible())
      .toBe(true);

    await page.getByRole("button", { name: /^Objectives/ }).click();
    await page.getByRole("button", { name: "New objective" }).first().click();
    await drawer()
      .getByPlaceholder("reduce-inference-cost")
      .fill("ship-docs-weekly");
    await drawer()
      .getByPlaceholder(/Describe the goal/)
      .fill("Publish docs every week.");
    await drawer().getByRole("button", { name: "Create objective" }).click();
    await expect
      .poll(() =>
        page.getByText("ship-docs-weekly", { exact: true }).isVisible(),
      )
      .toBe(true);
  });

  it("creates a skill, publishes v1 with a supporting file, and shows the policy applied", async () => {
    await nav().getByRole("link", { name: "Skills" }).click();
    await page.getByRole("button", { name: "+ New skill" }).click();
    await drawer().getByPlaceholder("release-notes-gen").fill(SKILL);
    await drawer()
      .getByPlaceholder("What this skill does…")
      .fill("Draft release notes");
    await drawer().getByPlaceholder("git, conventional").fill("git, docs");
    await drawer().getByRole("button", { name: "Create skill" }).click();
    await page.waitForURL(`**/prompts/${SKILL}`);

    await page.getByRole("button", { name: "+ New version" }).click();
    await drawer()
      .locator("textarea")
      .fill(
        "# Release notes\n\nSummarise merged pull requests. Use template.md.",
      );
    await drawer().getByRole("button", { name: "+ file" }).click();
    await drawer().locator("textarea").fill("## Features\n## Fixes");
    await drawer().getByRole("button", { name: "Publish version" }).click();
    await expect
      .poll(() => page.getByText(/v1 · active/).isVisible())
      .toBe(true);

    await page.getByRole("button", { name: /^Files/ }).click();
    await expect.poll(() => page.getByText("file-1.md").isVisible()).toBe(true);
    await page.getByRole("button", { name: /^Applied policies/ }).click();
    await expect
      .poll(() => page.getByText(POLICY.name).first().isVisible())
      .toBe(true);
    await page.getByRole("button", { name: "Preview" }).click();
    await expect
      .poll(() => page.getByText(POLICY.content).first().isVisible())
      .toBe(true);
  });

  it("publishes v2 and lists both versions in the history", async () => {
    await openSkill(SKILL);
    await page.getByRole("button", { name: "+ New version" }).click();
    await drawer()
      .locator("textarea")
      .fill("# Release notes v2\n\nGroup by feat, fix, docs.");
    await drawer().getByRole("button", { name: "Publish version" }).click();
    await expect
      .poll(() => page.getByText(/v2 · active/).isVisible())
      .toBe(true);
    await page.getByRole("button", { name: /v2 · active/ }).click();
    await page.getByRole("button", { name: /View full history/ }).click();
    await expect
      .poll(() => drawer().getByText(/^v1/).first().isVisible())
      .toBe(true);
    await drawer().getByRole("button", { name: "Close" }).click();
  });

  it("finds the skill with search and the owner filter", async () => {
    await goto("/prompts");
    await page
      .getByRole("searchbox", { name: "Search skills" })
      .or(page.getByPlaceholder("Search skills…"))
      .fill("release");
    await expect
      .poll(() =>
        page
          .getByRole("link", { name: SKILL })
          .or(page.getByText(SKILL))
          .first()
          .isVisible(),
      )
      .toBe(true);
    await page
      .getByRole("group", { name: "Filter skills by owner" })
      .getByRole("button", { name: "Mine" })
      .click();
    await expect
      .poll(() => page.getByText(SKILL).first().isVisible())
      .toBe(true);
  });

  it("deprecates a second skill", async () => {
    await goto("/prompts");
    await page.getByRole("button", { name: "+ New skill" }).click();
    await drawer().getByPlaceholder("release-notes-gen").fill("old-skill");
    await drawer().getByRole("button", { name: "Create skill" }).click();
    await page.waitForURL("**/prompts/old-skill");
    await page.getByRole("button", { name: "Deprecate" }).click();
    await expect
      .poll(() => page.getByText("deprecated", { exact: true }).isVisible())
      .toBe(true);
  });

  it("creates a project, grants it the skill, and opens every project tab", async () => {
    await goto("/projects");
    await page.getByRole("button", { name: "+ New project" }).click();
    await drawer().getByPlaceholder("Data Migration").fill(PROJECT);
    await drawer()
      .getByPlaceholder("What this project owns…")
      .fill("E2E project");
    await drawer().getByRole("button", { name: "Create project" }).click();
    await expect
      .poll(() => page.getByText(PROJECT).first().isVisible())
      .toBe(true);

    await openSkill(SKILL);
    await page.getByRole("button", { name: "Share" }).click();
    await drawer()
      .getByText(PROJECT)
      .locator("xpath=..")
      .getByRole("button", { name: "Grant" })
      .click();
    await expect
      .poll(() =>
        drawer()
          .getByText(PROJECT)
          .locator("xpath=..")
          .getByRole("button", { name: "Revoke" })
          .isVisible(),
      )
      .toBe(true);
    await drawer().getByRole("button", { name: "Close" }).click();

    await goto("/projects");
    await page.getByRole("link", { name: new RegExp(PROJECT) }).click();
    for (const tab of [
      /^Members/,
      /^Skills/,
      /^Repositories/,
      /^Teams/,
      /^Governance/,
      /^Metrics/,
    ]) {
      await page.getByRole("button", { name: tab }).click();
    }
    expect(newPageErrors()).toEqual([]);
  });

  it.fails(
    "shows a skill granted through Share on the project's Skills tab (015/006)",
    async () => {
      await goto("/projects");
      await page.getByRole("link", { name: new RegExp(PROJECT) }).click();
      await expect
        .poll(
          () => page.getByRole("button", { name: /^Skills \(1\)/ }).isVisible(),
          { timeout: 3_000 },
        )
        .toBe(true);
    },
  );

  it("links a repository to the project", async () => {
    await page.getByRole("button", { name: /^Repositories/ }).click();
    await page
      .getByRole("button", { name: /Add repository|Link repository|\+ Add/ })
      .first()
      .click();
    await drawer()
      .getByPlaceholder("support-copilot-service", { exact: true })
      .fill("docs-site");
    await drawer()
      .getByPlaceholder("github.com/acme/support-copilot-service")
      .fill("github.com/example/docs-site");
    await drawer().getByRole("button", { name: "Add repository" }).click();
    await expect
      .poll(() => page.getByText("docs-site").first().isVisible())
      .toBe(true);
  });

  it("issues an API key, shows it once, and lists only its prefix", async () => {
    await goto("/settings/api-keys");
    await page.getByRole("button", { name: "Issue key" }).first().click();
    await drawer().getByPlaceholder("CI deploy key").fill("e2e key");
    await drawer().getByText("prompts:read").click();
    await drawer().getByText("workflows:run").click();
    await drawer().getByRole("button", { name: "Generate key" }).click();
    await expect
      .poll(() => page.getByText("Key created").isVisible())
      .toBe(true);
    apiKey = (await page.locator("span.break-all").textContent())?.trim() ?? "";
    expect(apiKey).toMatch(/^sk_/);
    await page.getByRole("button", { name: /I've saved it/ }).click();
    await expect.poll(() => page.getByText("e2e key").isVisible()).toBe(true);
    expect(await page.getByText(apiKey).count()).toBe(0);
  });

  it("fetches the UI-made skill over REST with the policy applied", async () => {
    const res = await fetch(`${BASE}/api/skills/${SKILL}/expand`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: "{}",
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.content).toContain("Release notes v2");
    expect(body.content).toContain(POLICY.content);
    expect(body.appliedPolicies).toContain(POLICY.name);
  });

  it("fetches the UI-made skill over MCP", async () => {
    const headers = {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      Accept: "application/json, text/event-stream",
    };
    const init = await fetch(`${BASE}/mcp`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "initialize",
        params: {
          protocolVersion: "2025-06-18",
          capabilities: {},
          clientInfo: { name: "e2e", version: "0" },
        },
      }),
    });
    const session = {
      ...headers,
      "mcp-session-id": init.headers.get("mcp-session-id") ?? "",
      "mcp-protocol-version": "2025-06-18",
    };
    const call = async (name: string, args: object) => {
      const res = await fetch(`${BASE}/mcp`, {
        method: "POST",
        headers: session,
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 2,
          method: "tools/call",
          params: { name, arguments: args },
        }),
      });
      return (await res.json()).result.content[0].text as string;
    };
    expect(await call("sh-list", {})).toContain(SKILL);
    expect(await call("sh-run", { name: SKILL })).toContain(POLICY.content);
  });

  it("revokes the API key", async () => {
    await goto("/settings/api-keys");
    page.once("dialog", (d) => d.accept());
    await page.getByRole("button", { name: "Revoke" }).first().click();
    await expect
      .poll(
        async () =>
          (
            await fetch(`${BASE}/api/skills`, {
              headers: { Authorization: `Bearer ${apiKey}` },
            })
          ).status,
      )
      .toBe(401);
  });

  it("counts the runs on the metrics page", async () => {
    await goto("/metrics");
    await expect
      .poll(() => page.getByText(SKILL).first().isVisible())
      .toBe(true);
  });

  it.fails(
    "renders version labels without a doubled prefix (015/007)",
    async () => {
      await goto("/metrics");
      await page.waitForLoadState("networkidle");
      expect(await page.getByText(/\bvv\d/).count()).toBe(0);
    },
  );

  it("records the session's changes in the audit log and filters them", async () => {
    newPageErrors();
    await goto("/settings/audit-log");
    await expect
      .poll(() => page.getByText("prompt.created").first().isVisible())
      .toBe(true);
    await page.getByLabel("Search audit events").fill("policy.created");
    await expect
      .poll(() => page.getByText(POLICY.name).first().isVisible())
      .toBe(true);
  });

  it.fails(
    "loads the audit log without a hydration error (015/007)",
    async () => {
      newPageErrors();
      await goto("/settings/audit-log");
      await page.waitForLoadState("networkidle");
      expect(newPageErrors()).toEqual([]);
    },
  );

  it("opens and closes the navigation at phone width", async () => {
    await page.setViewportSize({ width: 375, height: 812 });
    await goto("/dashboard");
    await page.getByRole("button", { name: "Open navigation" }).click();
    await expect
      .poll(() => nav().getByRole("link", { name: "Skills" }).isVisible())
      .toBe(true);
    await page.getByRole("button", { name: "Close navigation" }).click();
    await page.setViewportSize({ width: 1280, height: 900 });
  });

  it("logs out, rejects a wrong password, and signs back in", async () => {
    await goto("/dashboard");
    await page.getByRole("button", { name: "Account menu" }).click();
    await page.getByRole("button", { name: "Log out" }).click();
    await page.waitForURL(/\/(login)?$/);

    await goto("/login");
    await page.getByLabel("Email").fill(ADMIN.email);
    await page.locator('input[type="password"]').fill("not-the-password");
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect.poll(() => page.url()).toMatch(/\/login/);
    await expect.poll(() => page.getByRole("alert").count()).toBeGreaterThan(0);

    // A failed attempt keeps the email (015/007) and clears the password; wait for the reset, retype only the password.
    await expect.poll(() => page.locator('input[type="password"]').inputValue()).toBe("");
    expect(await page.getByLabel("Email").inputValue()).toBe(ADMIN.email);
    await page.locator('input[type="password"]').fill(ADMIN.password);
    await page.getByRole("button", { name: "Sign in" }).click();
    await page.waitForURL("**/dashboard");
  });
});
