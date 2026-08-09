import type { Command } from "commander";
import { mkdirSync, readdirSync, readFileSync, rmdirSync, rmSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { readProjectLink } from "../config/project-link.js";
import { readCredentials } from "../config/credentials.js";
import { hashContent, readSyncManifest, writeSyncManifest } from "../config/sync-manifest.js";
import { getSkillVersions, listSkills, type SkillSummary, type SkillVersion } from "../http/skillcanon-client.js";
import { renderMainFile } from "../skills/skill-file.js";
import { planReconciliation, type RosterEntry, type SkillContent } from "../skills/reconcile.js";

export interface SyncResult {
  created: Array<{ slug: string; filename: string }>;
  updated: Array<{ slug: string; filename: string }>;
  removed: Array<{ slug: string; filename: string }>;
  conflicts: Array<{ slug: string; filename?: string; reason: string }>;
}

export interface SyncOptions {
  force?: boolean;
}

function skillDir(repoRoot: string, slug: string): string {
  return join(repoRoot, ".claude", "skills", `skillcanon-${slug}`);
}

function skillFilePath(repoRoot: string, slug: string, filename: string): string {
  return join(skillDir(repoRoot, slug), filename);
}

function readCurrentFileContent(repoRoot: string, slug: string, filename: string): string | undefined {
  const path = skillFilePath(repoRoot, slug, filename);
  return existsSync(path) ? readFileSync(path, "utf8") : undefined;
}

/**
 * Resolves one roster entry's desired local content (data-model.md
 * "SkillContent"): a new-shape template version's real main-file +
 * supporting files, or the unchanged pointer stub for a chain-kind skill
 * or a legacy-shape template version with no file bundle (research.md §6).
 */
export function resolveSkillContent(skill: SkillSummary, versions: SkillVersion[]): SkillContent {
  const version = versions.find((v) => v.id === skill.activeVersionId);
  if (!version || version.kind !== "template" || version.files.length === 0) {
    return { shape: "pointer-stub" };
  }
  const mainFile = version.files.find((f) => f.isMain);
  if (!mainFile) {
    return { shape: "pointer-stub" };
  }
  return {
    shape: "files",
    mainFile: { content: mainFile.content },
    supportingFiles: version.files.filter((f) => !f.isMain).map((f) => ({ name: f.name, content: f.content })),
  };
}

/**
 * The engine behind both the manual `sync` command and the automatic
 * SessionStart hook (which just invokes the same command with `--quiet`) —
 * there is no separate "automatic" code path (FR-014).
 */
export async function runSync(repoRoot: string, options: SyncOptions = {}): Promise<SyncResult> {
  const link = readProjectLink(repoRoot);
  const credentials = readCredentials(repoRoot);
  const clientOptions = { server: link.server, apiKey: credentials.apiKey };
  const roster = await listSkills(clientOptions, link.projectId);
  const manifest = readSyncManifest(repoRoot);

  // A skill with no published version yet is skipped from sync entirely
  // (data-model.md "SkillContent") — never fetched, never written.
  const publishedRoster = roster.filter((skill): skill is SkillSummary & { activeVersionId: string } => skill.activeVersionId !== null);

  const rosterEntries: RosterEntry[] = await Promise.all(
    publishedRoster.map(async (skill) => {
      const versions = await getSkillVersions(clientOptions, skill.name);
      return { skill, content: resolveSkillContent(skill, versions) };
    }),
  );

  const plan = planReconciliation(rosterEntries, {
    lastWrittenHashBySlugAndFile: manifest.stubs,
    getCurrentFileContent: (slug, filename) => readCurrentFileContent(repoRoot, slug, filename),
    force: options.force ?? false,
  });

  const result: SyncResult = { created: [], updated: [], removed: [], conflicts: [] };
  const touchedSlugs = new Set<string>();

  for (const action of plan.actions) {
    if (action.type === "create" || action.type === "update") {
      const content = action.frontmatter
        ? renderMainFile({ slug: action.slug, name: action.frontmatter.name, description: action.frontmatter.description, content: action.content })
        : action.content;
      mkdirSync(skillDir(repoRoot, action.slug), { recursive: true });
      writeFileSync(skillFilePath(repoRoot, action.slug, action.filename), content, "utf8");
      manifest.stubs[action.slug] ??= {};
      (manifest.stubs[action.slug] as Record<string, string>)[action.filename] = hashContent(content);
      result[action.type === "create" ? "created" : "updated"].push({ slug: action.slug, filename: action.filename });
      touchedSlugs.add(action.slug);
    } else if (action.type === "remove") {
      rmSync(skillFilePath(repoRoot, action.slug, action.filename), { force: true });
      const trackedFiles = manifest.stubs[action.slug];
      if (trackedFiles) {
        delete trackedFiles[action.filename];
        if (Object.keys(trackedFiles).length === 0) delete manifest.stubs[action.slug];
      }
      result.removed.push({ slug: action.slug, filename: action.filename });
      touchedSlugs.add(action.slug);
    } else if (action.type === "conflict") {
      result.conflicts.push(
        action.reason === "slug-collision"
          ? { slug: action.slug, reason: action.reason }
          : { slug: action.slug, filename: action.filename, reason: action.reason },
      );
    }
  }

  for (const slug of touchedSlugs) {
    const dir = skillDir(repoRoot, slug);
    if (existsSync(dir) && readdirSync(dir).length === 0) {
      rmdirSync(dir);
    }
  }

  writeSyncManifest(repoRoot, manifest);
  return result;
}

export function registerSyncCommand(program: Command): void {
  program
    .command("sync")
    .description("Sync the local skill roster with the linked SkillCanon project.")
    .option("--force", "overwrite a hand-edited file instead of skipping it")
    .option("--quiet", "warn instead of erroring on a request-level failure (used by the SessionStart hook)")
    .action(async (opts: { force?: boolean; quiet?: boolean }) => {
      try {
        const result = await runSync(process.cwd(), { force: opts.force });
        for (const conflict of result.conflicts) {
          const target = conflict.filename ? `${conflict.slug}/${conflict.filename}` : conflict.slug;
          process.stderr.write(`Skipped "${target}": ${conflict.reason}. Run with --force to overwrite a hand-edited file.\n`);
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
