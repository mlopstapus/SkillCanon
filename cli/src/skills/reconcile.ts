import type { SkillSummary } from "../http/skillcanon-client.js";
import { hashContent } from "../config/sync-manifest.js";
import { deriveSlug } from "./stub.js";

export type ReconcileAction =
  | { type: "create"; slug: string; name: string; description: string }
  | { type: "update"; slug: string; name: string; description: string }
  | { type: "remove"; slug: string }
  | { type: "conflict"; slug: string; reason: "hand-edited" | "slug-collision" };

export interface ReconcilePlan {
  actions: ReconcileAction[];
}

export interface ReconcileOptions {
  /** Hash the CLI itself last wrote for each currently-tracked slug (the Sync Record). */
  lastWrittenHashBySlug?: Record<string, string>;
  /** Current on-disk content for each currently-tracked slug, `undefined` if the file is missing. */
  currentContentBySlug?: Map<string, string | undefined>;
  /** Bypasses a hand-edit conflict (never a slug-collision conflict) — FR-010's "explicit action". */
  force?: boolean;
}

/**
 * Diffs the server roster against currently-tracked stubs into a
 * create/update/remove/conflict plan (data-model.md "Skill Stub" lifecycle).
 *
 * Conflict detection (FR-010, FR-010a):
 * - Two roster prompts deriving the same slug are both flagged
 *   `slug-collision` and neither is written, regardless of `force`.
 * - A tracked slug whose on-disk content no longer matches the hash the CLI
 *   itself last wrote is flagged `hand-edited` and left untouched, unless
 *   `force` is set. A *missing* file (deleted, not edited) is not a
 *   conflict — it is simply recreated, per the "deleted stub" edge case.
 */
export function planReconciliation(
  roster: SkillSummary[],
  trackedSlugs: string[],
  options: ReconcileOptions = {},
): ReconcilePlan {
  const { lastWrittenHashBySlug = {}, currentContentBySlug = new Map(), force = false } = options;
  const trackedSet = new Set(trackedSlugs);

  const bySlug = new Map<string, SkillSummary[]>();
  for (const skill of roster) {
    const slug = deriveSlug(skill.name);
    const group = bySlug.get(slug) ?? [];
    group.push(skill);
    bySlug.set(slug, group);
  }

  const actions: ReconcileAction[] = [];

  for (const [slug, skills] of bySlug) {
    if (skills.length > 1) {
      actions.push({ type: "conflict", slug, reason: "slug-collision" });
      continue;
    }

    const skill = skills[0] as SkillSummary;
    const isTracked = trackedSet.has(slug);

    if (isTracked && !force) {
      const currentContent = currentContentBySlug.get(slug);
      const lastHash = lastWrittenHashBySlug[slug];
      if (currentContent !== undefined && lastHash !== undefined && hashContent(currentContent) !== lastHash) {
        actions.push({ type: "conflict", slug, reason: "hand-edited" });
        continue;
      }
    }

    actions.push({ type: isTracked ? "update" : "create", slug, name: skill.name, description: skill.description ?? "" });
  }

  const rosterSlugs = new Set(bySlug.keys());
  for (const slug of trackedSlugs) {
    if (!rosterSlugs.has(slug)) {
      actions.push({ type: "remove", slug });
    }
  }

  return { actions };
}
