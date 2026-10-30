import { chromium } from "playwright";
import { createRequire } from "node:module";
const require = createRequire(process.cwd() + "/");
const axePath = require.resolve("axe-core");
const BASE = "http://localhost:3103";
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });

async function contrast(label) {
  await page.addScriptTag({ path: axePath });
  const res = await page.evaluate(async () => (await window.axe.run({ runOnly: ["color-contrast"] })).violations);
  const nodes = res.flatMap((v) => v.nodes.map((n) => `${n.target.join(" ")} :: ${n.any?.[0]?.message ?? ""}`));
  console.log(`${label}: ${nodes.length} contrast issues`);
  nodes.slice(0, 6).forEach((n) => console.log("   ", n.slice(0, 220)));
}
async function shot(name, path, theme, size = { width: 1280, height: 900 }) {
  await page.setViewportSize(size);
  await page.goto(BASE + "/login");
  await page.evaluate((t) => { if (t === "dark") { localStorage.setItem("skillcanon-theme", "dark"); } else localStorage.removeItem("skillcanon-theme"); }, theme);
  await page.goto(BASE + path);
  await page.waitForLoadState("networkidle");
  await page.screenshot({ path: `artifacts/tribe/${name}-${theme}-${size.width}.png`, fullPage: false });
  await contrast(`${name} ${theme} ${size.width}`);
}

// login (signed out) first, then setup
for (const t of ["light", "dark"]) await shot("login", "/login", t);
await page.goto(BASE + "/register");
await page.getByPlaceholder("Acme Ops").fill("Tribe");
await page.getByPlaceholder("Platform").fill("Platform");
await page.getByPlaceholder("Jane Doe").fill("Ben Admin");
await page.getByPlaceholder("jane", { exact: true }).fill("benadmin");
await page.getByPlaceholder("jane@example.com").fill("ben@example.test");
await page.locator('input[type="password"]').fill("tribe-local-password-1");
await page.getByText("Create instance", { exact: true }).click();
await page.waitForURL("**/welcome");
const pages = [["dashboard", "/dashboard"], ["skills", "/prompts"], ["metrics", "/metrics"], ["settings", "/settings/api-keys"], ["audit", "/settings/audit-log"], ["teams", "/teams"], ["projects", "/projects"]];
for (const t of ["light", "dark"]) {
  for (const [n, p] of pages) await shot(n, p, t);
  await shot("dashboard", "/dashboard", t, { width: 390, height: 844 });
}
await browser.close();
