/**
 * Invites someone from the UI, reads the invitation email from the mail sink
 * (docker-compose.e2e.yaml's mailpit), accepts it in a fresh browser session,
 * and lands signed in. Runs after ui-walk (see sequencer.ts) and reuses its
 * admin. Needs the sink: point E2E_MAIL_API at it (default http://localhost:8025).
 */
import { chromium, type Browser, type BrowserContext, type Page } from "playwright";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const BASE = (process.env.E2E_BASE_URL ?? "http://localhost:3000").replace(/\/$/, "");
const MAIL = (process.env.E2E_MAIL_API ?? "http://localhost:8025").replace(/\/$/, "");
const ADMIN = { email: "e2e-admin@example.test", password: "e2e-local-password-1" };
const INVITEE = `new-member-${Date.now()}@example.test`;

let browser: Browser;
let adminPage: Page;
let guest: BrowserContext;

async function inviteLink(to: string): Promise<string> {
  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline) {
    const list = (await (await fetch(`${MAIL}/api/v1/search?query=${encodeURIComponent(`to:${to}`)}`)).json()) as {
      messages?: Array<{ ID: string }>;
    };
    const id = list.messages?.[0]?.ID;
    if (id) {
      const message = (await (await fetch(`${MAIL}/api/v1/message/${id}`)).json()) as { Text: string };
      const token = /\/invite\/([A-Za-z0-9_-]+)/.exec(message.Text)?.[1];
      if (token) return `${BASE}/invite/${token}`; // the emailed origin is the app's configured base, not necessarily this instance
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`No invitation email for ${to} reached the mail sink at ${MAIL}`);
}

beforeAll(async () => {
  browser = await chromium.launch({ headless: !/^(0|false)$/i.test(process.env.PW_HEADLESS ?? "") });
  adminPage = await browser.newPage();
  adminPage.setDefaultTimeout(10_000);
  guest = await browser.newContext();
});

afterAll(async () => {
  await browser?.close();
});

describe("invitation accept flow", { timeout: 60_000 }, () => {
  it("an admin invites someone and the invitation email reaches the sink", async () => {
    await adminPage.goto(`${BASE}/login`);
    await adminPage.getByLabel("Email").fill(ADMIN.email);
    await adminPage.locator('input[type="password"]').fill(ADMIN.password);
    await adminPage.getByRole("button", { name: "Sign in" }).click();
    await adminPage.waitForURL("**/dashboard");
    await adminPage.goto(`${BASE}/teams`);
    await adminPage.getByRole("button", { name: "Members" }).click();
    await adminPage.getByRole("button", { name: "+ invite by email" }).click();
    const drawer = adminPage.getByRole("dialog").filter({ visible: true });
    await drawer.getByPlaceholder("jamie@example.com").fill(INVITEE);
    await drawer.getByRole("button", { name: "Send invite" }).click();
    await expect.poll(() => adminPage.getByText(`Invitation sent to ${INVITEE}.`).isVisible()).toBe(true);
    expect(await inviteLink(INVITEE)).toContain("/invite/");
  });

  it("the invitee accepts from the emailed link and lands signed in", async () => {
    const page = await guest.newPage();
    page.setDefaultTimeout(10_000);
    await page.goto(await inviteLink(INVITEE));
    await page.getByLabel("Username").fill(`member${Date.now()}`);
    await page.locator('input[type="password"]').fill("a-strong-passphrase-1");
    await page.getByRole("button", { name: "Accept invitation" }).click();
    await page.waitForURL("**/dashboard");
    expect(page.url()).toContain("/dashboard");
  });

  it("the same link is then reported as already accepted", async () => {
    // A signed-out visitor: the accepting session above is still signed in and would be redirected.
    const page = await (await browser.newContext()).newPage();
    await page.goto(await inviteLink(INVITEE));
    await expect.poll(() => page.getByText("already accepted").first().isVisible()).toBe(true);
  });
});
