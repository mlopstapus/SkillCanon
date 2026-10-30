import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import type { FeedbackVersionCounts, SkillFeedbackSummary } from "../domain/feedback";
import { listForPrompt } from "../infrastructure/feedback-repo";

/** Per-version up/down/note counts plus the notes, newest first, for one skill in the organization. */
export async function listFeedbackForSkill<TSchema extends Record<string, unknown>>(
  db: PostgresJsDatabase<TSchema>,
  organizationId: string,
  promptId: string,
): Promise<SkillFeedbackSummary> {
  const items = await listForPrompt(db, organizationId, promptId);
  const byVersionId = new Map<string, FeedbackVersionCounts>();
  for (const item of items) {
    const counts = byVersionId.get(item.versionId) ?? {
      version: item.version,
      versionId: item.versionId,
      up: 0,
      down: 0,
      notes: 0,
    };
    if (item.rating === "up") counts.up += 1;
    if (item.rating === "down") counts.down += 1;
    if (item.kind === "note") counts.notes += 1;
    byVersionId.set(item.versionId, counts);
  }
  return {
    byVersion: [...byVersionId.values()].sort((a, b) => b.version.localeCompare(a.version, undefined, { numeric: true })),
    notes: items.filter((item) => item.kind === "note"),
  };
}
