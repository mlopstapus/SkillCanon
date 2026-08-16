import { mkdir, rename } from "node:fs/promises";
import { resolve } from "node:path";
import process from "node:process";
import { chromium } from "playwright";

/**
 * Replays the ownership-transfer UI against disposable local/demo data.
 * Required: DEMO_EMAIL, DEMO_PASSWORD, DEMO_PROMPT_NAME, DEMO_DESTINATION_NAME.
 * Optional: DEMO_BASE_URL, DEMO_DESTINATION_TYPE=user|team, PW_HEADLESS, PW_ARTIFACT_DIR.
 */
const REQUIRED_INPUTS = [
  "DEMO_EMAIL",
  "DEMO_PASSWORD",
  "DEMO_PROMPT_NAME",
  "DEMO_DESTINATION_NAME",
];

function readConfig() {
  const missing = REQUIRED_INPUTS.filter((name) => !process.env[name]?.trim());
  if (missing.length > 0) {
    throw new Error(
      "DEMO_EMAIL, DEMO_PASSWORD, DEMO_PROMPT_NAME, and DEMO_DESTINATION_NAME are required",
    );
  }

  const destinationType = process.env.DEMO_DESTINATION_TYPE?.trim() || "team";
  if (destinationType !== "user" && destinationType !== "team") {
    throw new Error('DEMO_DESTINATION_TYPE must be either "user" or "team"');
  }

  return {
    baseUrl: (process.env.DEMO_BASE_URL?.trim() || "http://localhost:3001").replace(/\/$/, ""),
    email: process.env.DEMO_EMAIL,
    password: process.env.DEMO_PASSWORD,
    promptName: process.env.DEMO_PROMPT_NAME,
    destinationName: process.env.DEMO_DESTINATION_NAME,
    destinationType,
    artifactDir: resolve(process.env.PW_ARTIFACT_DIR?.trim() || "artifacts/ownership-transfer"),
    headless: /^(1|true)$/i.test(process.env.PW_HEADLESS || ""),
  };
}

async function run() {
  const config = readConfig();
  await mkdir(config.artifactDir, { recursive: true });

  const browser = await chromium.launch({ headless: config.headless });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    recordVideo: { dir: config.artifactDir, size: { width: 1440, height: 900 } },
  });
  const page = await context.newPage();
  const video = page.video();

  try {
    await page.goto(`${config.baseUrl}/login`);
    await page.getByLabel("Email").fill(config.email);
    await page.locator('input[name="password"]').fill(config.password);
    await page.getByRole("button", { name: "Sign in" }).click();
    await page.waitForURL("**/dashboard");

    await page.goto(`${config.baseUrl}/prompts/${encodeURIComponent(config.promptName)}`);
    const transferButton = page.getByRole("button", { name: "Transfer ownership", exact: true });
    await transferButton.waitFor();
    await page.screenshot({ path: resolve(config.artifactDir, "01-before.png"), fullPage: true });

    await transferButton.click();
    const dialog = page.getByRole("dialog", { name: `Transfer ${config.promptName}` });
    await dialog.waitFor();
    await dialog
      .getByRole("button", { name: config.destinationType === "team" ? "Teams" : "People", exact: true })
      .click();
    await dialog.getByLabel("Search transfer candidates").fill(config.destinationName);
    await dialog.getByRole("button", { name: config.destinationName, exact: true }).click();
    await dialog.getByText("may lose access unless otherwise subscribed", { exact: false }).waitFor();
    await page.screenshot({ path: resolve(config.artifactDir, "02-confirmation.png"), fullPage: true });

    await dialog.getByRole("button", { name: "Transfer ownership", exact: true }).click();
    await dialog.waitFor({ state: "detached" });
    await page.getByText(config.destinationName, { exact: true }).first().waitFor();
    await page.screenshot({ path: resolve(config.artifactDir, "03-after.png"), fullPage: true });
  } catch (error) {
    await page.screenshot({ path: resolve(config.artifactDir, "failure.png"), fullPage: true });
    throw error;
  } finally {
    await context.close();
    await browser.close();
  }

  if (video) {
    const recordedVideo = await video.path();
    await rename(recordedVideo, resolve(config.artifactDir, "ownership-transfer.webm"));
  }

  console.log(`Ownership transfer demo passed. Artifacts: ${config.artifactDir}`);
}

run().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
