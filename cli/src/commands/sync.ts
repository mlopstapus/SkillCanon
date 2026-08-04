import type { Command } from "commander";
import { mkdirSync, readFileSync, rmSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { readProjectLink } from "../config/project-link.js";
import { readCredentials } from "../config/credentials.js";
import { hashContent, readSyncManifest, writeSyncManifest } from "../config/sync-manifest.js";
import { listSkills } from "../http/skillcanon-client.js";
import { renderStub } from "../skills/stub.js";
import { planReconciliation } from "../skills/reconcile.js";

export interface SyncResult {
  created: string[];
  updated: string[];
  removed: string[];
  conflicts: Array<{ slug: string; reason: string }>;
}

export interface SyncOptions {
  force?: boolean;
}

function stubDir(repoRoot: string, slug: string): string {
  return join(repoRoot, ".claude", "skills", `skillcanon-${slug}`);
}

function stubFile(repoRoot: string, slug: string): string {
  return join(stubDir(repoRoot, slug), "SKILL.md");
}

function readCurrentStubContent(repoRoot: string, slug: string): string | undefined {
  const path = stubFile(repoRoot, slug);
  return existsSync(path) ? readFileSync(path, "utf8") : undefined;
}

/**
 * The engine behind both the manual `sync` command and the automatic
 * SessionStart hook (which just invokes the same command with `--quiet`) —
 * there is no separate "automatic" code path (FR-014).
 */
export async function runSync(repoRoot: string, options: SyncOptions = {}): Promise<SyncResult> {
  const link = readProjectLink(repoRoot);
  const credentials = readCredentials(repoRoot);
  const roster = await listSkills({ server: link.server, apiKey: credentials.apiKey }, link.projectId);
  const manifest = readSyncManifest(repoRoot);

  const trackedSlugs = Object.keys(manifest.stubs);
  const currentContentBySlug = new Map(trackedSlugs.map((slug) => [slug, readCurrentStubContent(repoRoot, slug)]));
  const plan = planReconciliation(roster, trackedSlugs, {
    lastWrittenHashBySlug: manifest.stubs,
    currentContentBySlug,
    force: options.force ?? false,
  });

  const result: SyncResult = { created: [], updated: [], removed: [], conflicts: [] };

  for (const action of plan.actions) {
    if (action.type === "create" || action.type === "update") {
      const content = renderStub({ slug: action.slug, name: action.name, description: action.description });
      mkdirSync(stubDir(repoRoot, action.slug), { recursive: true });
      writeFileSync(stubFile(repoRoot, action.slug), content, "utf8");
      manifest.stubs[action.slug] = hashContent(content);
      result[action.type === "create" ? "created" : "updated"].push(action.slug);
    } else if (action.type === "remove") {
      rmSync(stubDir(repoRoot, action.slug), { recursive: true, force: true });
      delete manifest.stubs[action.slug];
      result.removed.push(action.slug);
    } else {
      result.conflicts.push({ slug: action.slug, reason: action.reason });
    }
  }

  writeSyncManifest(repoRoot, manifest);
  return result;
}

export function registerSyncCommand(program: Command): void {
  program
    .command("sync")
    .description("Sync the local skill roster with the linked SkillCanon project.")
    .option("--force", "overwrite a hand-edited stub instead of skipping it")
    .option("--quiet", "warn instead of erroring on a request-level failure (used by the SessionStart hook)")
    .action(async (opts: { force?: boolean; quiet?: boolean }) => {
      try {
        const result = await runSync(process.cwd(), { force: opts.force });
        for (const conflict of result.conflicts) {
          process.stderr.write(`Skipped "${conflict.slug}": ${conflict.reason}. Run with --force to overwrite a hand-edited stub.\n`);
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        if (opts.quiet) {
          process.stderr.write(`Warning: skillcanon sync failed (${message}). The existing skill roster is unchanged.\n`);
          return;
        }
        throw err;
      }
    });
}
