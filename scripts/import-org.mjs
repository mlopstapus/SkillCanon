import { readFileSync } from "node:fs";
import { isAbsolute, relative, resolve } from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { applyPlan, buildPlan, formatReport, parseRoster } from "./lib/org-import.mjs";

/**
 * Builds teams and people from an HR roster over the REST API (019/001).
 * pnpm import:org --roster <csv> --teams <json> [--server <url>] [--api-key-file <path>] [--root-team <slug>] [--dry-run]
 * The API key can also come from SKILLCANON_API_KEY. Files must live outside this repository.
 */
const USAGE =
  "Usage: pnpm import:org --roster <csv> --teams <json> [--server <url>] [--api-key-file <path>] [--root-team <slug>] [--dry-run]";
const repoRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--dry-run") args.dryRun = true;
    else if (a.startsWith("--")) args[a.slice(2)] = argv[++i];
    else throw new Error(`Unexpected argument "${a}". ${USAGE}`);
  }
  return args;
}

function outsideRepo(path) {
  const rel = relative(repoRoot, resolve(path));
  if (rel === "" || (!rel.startsWith("..") && !isAbsolute(rel))) {
    throw new Error(`${path} is inside the repository. Keep the roster and mapping outside the tree.`);
  }
  return path;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.roster || !args.teams) throw new Error(USAGE);
  const rows = parseRoster(readFileSync(outsideRepo(args.roster), "utf8"));
  const mapping = JSON.parse(readFileSync(outsideRepo(args.teams), "utf8"));
  const key = (args["api-key-file"] ? readFileSync(args["api-key-file"], "utf8") : (process.env.SKILLCANON_API_KEY ?? "")).trim();
  if (!key) throw new Error("No API key: pass --api-key-file or set SKILLCANON_API_KEY.");
  const server = (args.server ?? "http://localhost:3000").replace(/\/$/, "");

  async function call(method, path, body) {
    const res = await fetch(server + path, {
      method,
      headers: { "content-type": "application/json", authorization: `Bearer ${key}` },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await res.text();
    let json = {};
    try {
      json = JSON.parse(text);
    } catch {
      // non-JSON error body: the status is enough
    }
    return { ok: res.ok, status: res.status, json };
  }

  const plan = buildPlan(rows, mapping);
  const report = await applyPlan(plan, { call, rootTeamSlug: args["root-team"], dryRun: Boolean(args.dryRun) });
  console.log(formatReport(report, { dryRun: Boolean(args.dryRun) }));
  process.exitCode = report.errors.length > 0 ? 1 : 0;
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
