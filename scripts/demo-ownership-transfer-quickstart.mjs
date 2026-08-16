import { mkdir, rename } from "node:fs/promises";
import { resolve } from "node:path";
import process from "node:process";
import { chromium } from "playwright";

/**
 * Zero-config walkthrough of the skill ownership transfer feature (PDR-019),
 * built to run as-is against the seeded local dev stack (`docker compose up
 * -d --build app`, or `pnpm dev`) with no required env vars — unlike
 * `demo-ownership-transfer.mjs`, which is intentionally parameterized for
 * arbitrary environments and requires the caller to supply real data.
 *
 * Demonstrates, end to end:
 *   - login
 *   - opening the Transfer ownership drawer from the skill detail page
 *   - Escape-to-close (Drawer primitive's keyboard accessibility)
 *   - switching between the People / Teams candidate tabs
 *   - searching candidates, picking one, and the confirmation step's warning
 *   - a user -> team transfer, then a team -> user transfer back
 *   - the resulting `skill.owner_transferred` audit log entries
 *
 * The final transfer restores the skill to its original owner, so this is
 * safe to re-run against a shared dev database without leaving it mutated.
 *
 * Optional overrides: DEMO_BASE_URL, DEMO_EMAIL, DEMO_PASSWORD,
 * DEMO_PROMPT_NAME, DEMO_DESTINATION_TEAM, PW_HEADLESS, PW_ARTIFACT_DIR.
 */
function readConfig() {
  return {
    baseUrl: (process.env.DEMO_BASE_URL?.trim() || "http://localhost:3000").replace(/\/$/, ""),
    email: process.env.DEMO_EMAIL?.trim() || "alice@example.com",
    password: process.env.DEMO_PASSWORD?.trim() || "password",
    ownerDisplayName: process.env.DEMO_OWNER_DISPLAY_NAME?.trim() || "Alice Admin",
    promptName: process.env.DEMO_PROMPT_NAME?.trim() || "smoke-test-prompt",
    destinationTeam: process.env.DEMO_DESTINATION_TEAM?.trim() || "Design",
    artifactDir: resolve(process.env.PW_ARTIFACT_DIR?.trim() || "artifacts/ownership-transfer-quickstart"),
    headless: /^(1|true)$/i.test(process.env.PW_HEADLESS || "true"),
  };
}

async function login(page, config) {
  await page.goto(`${config.baseUrl}/login`);
  await page.getByLabel("Email").fill(config.email);
  await page.locator('input[name="password"]').fill(config.password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL("**/dashboard");
}

async function transferTo(page, config, dialog, tabName, candidateName) {
  await dialog.getByRole("button", { name: tabName, exact: true }).click();
  await dialog.getByLabel("Search transfer candidates").fill(candidateName);
  await dialog.getByRole("button", { name: candidateName, exact: true }).click();
  await dialog.getByText("may lose access unless otherwise subscribed", { exact: false }).waitFor();
  await dialog.getByRole("button", { name: "Transfer ownership", exact: true }).click();
  await dialog.waitFor({ state: "detached" });
}

async function run() {
  const config = readConfig();
  await mkdir(config.artifactDir, { recursive: true });
  const shot = (name) => resolve(config.artifactDir, name);

  const browser = await chromium.launch({ headless: config.headless });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    recordVideo: { dir: config.artifactDir, size: { width: 1440, height: 900 } },
  });
  const page = await context.newPage();
  const video = page.video();

  try {
    await login(page, config);

    const promptUrl = `${config.baseUrl}/prompts/${encodeURIComponent(config.promptName)}`;
    await page.goto(promptUrl);
    const transferButton = page.getByRole("button", { name: "Transfer ownership", exact: true });
    await transferButton.waitFor();
    await page.getByText(config.ownerDisplayName, { exact: true }).first().waitFor();
    await page.screenshot({ path: shot("01-owned-by-alice.png"), fullPage: true });

    // Open the drawer, then prove Escape closes it before doing anything else.
    await transferButton.click();
    let dialog = page.getByRole("dialog", { name: `Transfer ${config.promptName}` });
    await dialog.waitFor();
    await page.screenshot({ path: shot("02-drawer-open-people-tab.png"), fullPage: true });
    await page.keyboard.press("Escape");
    await dialog.waitFor({ state: "detached" });

    // Reopen and switch to the Teams tab, then hand off to a team.
    await transferButton.click();
    dialog = page.getByRole("dialog", { name: `Transfer ${config.promptName}` });
    await dialog.waitFor();
    await dialog.getByRole("button", { name: "Teams", exact: true }).click();
    await dialog.getByLabel("Search transfer candidates").fill(config.destinationTeam);
    await dialog.getByRole("button", { name: config.destinationTeam, exact: true }).click();
    await dialog.getByText("may lose access unless otherwise subscribed", { exact: false }).waitFor();
    await page.screenshot({ path: shot("03-confirm-user-to-team.png"), fullPage: true });
    await dialog.getByRole("button", { name: "Transfer ownership", exact: true }).click();
    await dialog.waitFor({ state: "detached" });
    await page.getByText(config.destinationTeam, { exact: true }).first().waitFor();
    await page.screenshot({ path: shot("04-owned-by-team.png"), fullPage: true });

    // Confirm the audit trail picked up the transfer.
    await page.goto(`${config.baseUrl}/settings/audit-log`);
    await page.getByLabel("Search audit events").fill("owner_transferred");
    await page.getByText("owner_transferred", { exact: false }).first().waitFor();
    await page.screenshot({ path: shot("05-audit-log-entry.png"), fullPage: true });

    // Transfer back (team -> user) so the shared dev DB is left unchanged.
    await page.goto(promptUrl);
    await transferButton.waitFor();
    await transferButton.click();
    dialog = page.getByRole("dialog", { name: `Transfer ${config.promptName}` });
    await dialog.waitFor();
    await transferTo(page, config, dialog, "People", config.ownerDisplayName);
    await page.getByText(config.ownerDisplayName, { exact: true }).first().waitFor();
    await page.screenshot({ path: shot("06-restored-to-alice.png"), fullPage: true });
  } catch (error) {
    await page.screenshot({ path: shot("failure.png"), fullPage: true });
    throw error;
  } finally {
    await context.close();
    await browser.close();
  }

  if (video) {
    const recordedVideo = await video.path();
    await rename(recordedVideo, resolve(config.artifactDir, "ownership-transfer-quickstart.webm"));
  }

  console.log(`Ownership transfer quickstart demo passed. Artifacts: ${config.artifactDir}`);
}

run().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
