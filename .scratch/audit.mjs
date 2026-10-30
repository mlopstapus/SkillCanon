import { chromium } from "playwright";
import { createRequire } from "node:module";
const axePath = createRequire(process.cwd() + "/").resolve("axe-core");
const BASE = "http://localhost:3103";
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
await page.goto(BASE + "/login");
await page.getByLabel("Email").fill("e2e-admin@example.test");
await page.locator('input[type="password"]').fill("e2e-local-password-1");
await page.getByRole("button", { name: "Sign in" }).click();
await page.waitForURL("**/dashboard");
for (const theme of ["light", "dark"]) {
  await page.evaluate((t) => (t === "dark" ? localStorage.setItem("skillcanon-theme", "dark") : localStorage.removeItem("skillcanon-theme")), theme);
  for (const path of ["/dashboard", "/prompts", "/metrics", "/settings/api-keys", "/prompts/release-notes", "/teams", "/projects", "/settings/audit-log"]) {
    await page.goto(BASE + path);
    await page.waitForLoadState("networkidle");
    await page.addScriptTag({ path: axePath });
    const v = await page.evaluate(async () => (await window.axe.run({ runOnly: ["color-contrast"] })).violations.flatMap((x) => x.nodes.map((n) => `${n.target.join(" ")} :: ${n.any[0]?.message}`)));
    console.log(theme, path, v.length);
    v.slice(0, 4).forEach((m) => console.log("   ", m.slice(0, 230)));
  }
}
await browser.close();
