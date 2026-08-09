import type { SkillSummary } from "../http/skillcanon-client.js";
import { hashContent } from "../config/sync-manifest.js";
import { deriveSlug, pointerStubBody } from "./skill-file.js";

/** A skill's resolved desired content, before frontmatter is rendered (data-model.md "SkillContent"). */
export type SkillContent =
  | { shape: "files"; mainFile: { content: string }; supportingFiles: Array<{ name: string; content: string }> }
  | { shape: "pointer-stub" };

export interface RosterEntry {
  skill: SkillSummary;
  content: SkillContent;
}

export type ReconcileAction =
  | { type: "create" | "update"; slug: string; filename: string; content: string; frontmatter?: { name: string; description: string } }
  | { type: "remove"; slug: string; filename: string }
  | { type: "conflict"; slug: string; filename: string; reason: "hand-edited" }
  | { type: "conflict"; slug: string; reason: "slug-collision" };

export interface ReconcilePlan {
  actions: ReconcileAction[];
}

export interface ReconcileOptions {
  /** Hash the CLI itself last wrote for each currently-tracked (slug, filename) pair — the Sync Record, i.e. `SyncManifest.stubs`. */
  lastWrittenHashBySlugAndFile?: Record<string, Record<string, string>>;
  /** Reads a tracked file's current on-disk content, `undefined` if missing. */
  getCurrentFileContent?: (slug: string, filename: string) => string | undefined;
  /** Bypasses a hand-edit conflict (never a slug-collision conflict) — FR-010's "explicit action". */
  force?: boolean;
}

const MAIN_FILENAME = "SKILL.md";

interface DesiredFile {
  content: string;
  frontmatter?: { name: string; description: string };
}

function desiredFilesFor(skill: SkillSummary, content: SkillContent): Map<string, DesiredFile> {
  const name = skill.name;
  const description = skill.description ?? "";
  const slug = deriveSlug(name);
  const desired = new Map<string, DesiredFile>();

  if (content.shape === "files") {
    desired.set(MAIN_FILENAME, { content: content.mainFile.content, frontmatter: { name, description } });
    for (const file of content.supportingFiles) {
      desired.set(file.name, { content: file.content });
    }
  } else {
    desired.set(MAIN_FILENAME, { content: pointerStubBody(slug), frontmatter: { name, description } });
  }

  return desired;
}

/** True if the tracked hash for (slug, filename) no longer matches on-disk content — a hand-edit. */
function isHandEdited(
  slug: string,
  filename: string,
  trackedHash: string | undefined,
  getCurrentFileContent: (slug: string, filename: string) => string | undefined,
): boolean {
  if (trackedHash === undefined) return false;
  const currentContent = getCurrentFileContent(slug, filename);
  if (currentContent === undefined) return false; // deleted, not edited — not a conflict
  return hashContent(currentContent) !== trackedHash;
}

/**
 * Diffs the server roster against currently-tracked files into a
 * per-(skill,file) create/update/remove/conflict plan (data-model.md
 * "ReconcileAction" lifecycle).
 *
 * Conflict detection (FR-010, FR-010a):
 * - Two roster skills deriving the same slug are both flagged
 *   `slug-collision` (whole-skill, unchanged) and neither is written,
 *   regardless of `force`.
 * - A tracked file whose on-disk content no longer matches the hash the
 *   CLI itself last wrote is flagged `hand-edited` and left untouched,
 *   unless `force` is set — independently per file, so a hand-edited
 *   supporting file never blocks its siblings (research.md §4). A
 *   *missing* file (deleted, not edited) is not a conflict — it is simply
 *   recreated.
 * - A previously-tracked file no longer in the desired set is removed,
 *   unless it is itself hand-edited, in which case it is left in place
 *   and reported as a conflict (research.md §5).
 */
export function planReconciliation(roster: RosterEntry[], options: ReconcileOptions = {}): ReconcilePlan {
  const { lastWrittenHashBySlugAndFile = {}, getCurrentFileContent = () => undefined, force = false } = options;

  const bySlug = new Map<string, RosterEntry[]>();
  for (const entry of roster) {
    const slug = deriveSlug(entry.skill.name);
    const group = bySlug.get(slug) ?? [];
    group.push(entry);
    bySlug.set(slug, group);
  }

  const actions: ReconcileAction[] = [];
  const desiredSlugs = new Set<string>();

  for (const [slug, entries] of bySlug) {
    if (entries.length > 1) {
      actions.push({ type: "conflict", slug, reason: "slug-collision" });
      continue;
    }

    desiredSlugs.add(slug);
    const { skill, content } = entries[0] as RosterEntry;
    const desiredFiles = desiredFilesFor(skill, content);
    const trackedHashes = lastWrittenHashBySlugAndFile[slug] ?? {};

    for (const [filename, desired] of desiredFiles) {
      const isTracked = Object.hasOwn(trackedHashes, filename);
      if (isTracked && !force && isHandEdited(slug, filename, trackedHashes[filename], getCurrentFileContent)) {
        actions.push({ type: "conflict", slug, filename, reason: "hand-edited" });
        continue;
      }
      actions.push({
        type: isTracked ? "update" : "create",
        slug,
        filename,
        content: desired.content,
        ...(desired.frontmatter ? { frontmatter: desired.frontmatter } : {}),
      });
    }

    for (const filename of Object.keys(trackedHashes)) {
      if (desiredFiles.has(filename)) continue;
      if (!force && isHandEdited(slug, filename, trackedHashes[filename], getCurrentFileContent)) {
        actions.push({ type: "conflict", slug, filename, reason: "hand-edited" });
        continue;
      }
      actions.push({ type: "remove", slug, filename });
    }
  }

  for (const [slug, trackedHashes] of Object.entries(lastWrittenHashBySlugAndFile)) {
    if (desiredSlugs.has(slug)) continue;
    for (const filename of Object.keys(trackedHashes)) {
      actions.push({ type: "remove", slug, filename });
    }
  }

  return { actions };
}
