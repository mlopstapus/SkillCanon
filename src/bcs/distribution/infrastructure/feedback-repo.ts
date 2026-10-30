import { and, desc, eq, inArray, sql } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import type { Feedback, SkillFeedbackItem } from "../domain/feedback";
import { feedback, promptUsage } from "./schema";

export interface InsertFeedbackParams {
  id: string;
  organizationId: string;
  serveId: string;
  userId: string;
  kind: Feedback["kind"];
  rating: Feedback["rating"];
  text: string | null;
}

export async function insert<TSchema extends Record<string, unknown>>(
  tx: PostgresJsDatabase<TSchema>,
  params: InsertFeedbackParams,
): Promise<Feedback> {
  const [row] = await tx.insert(feedback).values(params).returning();
  if (!row) throw new Error("feedback insert returned no row.");
  return {
    id: row.id,
    serveId: row.serveId,
    userId: row.userId,
    kind: row.kind,
    rating: row.rating,
    text: row.text,
    createdAt: row.createdAt,
  };
}

/** Every feedback row filed against any serve of `promptId`, newest first. */
export async function listForPrompt<TSchema extends Record<string, unknown>>(
  tx: PostgresJsDatabase<TSchema>,
  organizationId: string,
  promptId: string,
): Promise<SkillFeedbackItem[]> {
  const rows = await tx
    .select({ f: feedback, version: promptUsage.promptVersion, versionId: promptUsage.promptVersionId })
    .from(feedback)
    .innerJoin(promptUsage, eq(promptUsage.id, feedback.serveId))
    .where(and(eq(feedback.organizationId, organizationId), eq(promptUsage.promptId, promptId)))
    .orderBy(desc(feedback.createdAt));
  return rows.map(({ f, version, versionId }) => ({
    id: f.id,
    serveId: f.serveId,
    userId: f.userId,
    kind: f.kind,
    rating: f.rating,
    text: f.text,
    createdAt: f.createdAt,
    version,
    versionId,
    addressedAt: f.addressedAt,
    addressedInVersionId: f.addressedInVersionId,
  }));
}

/** Up/down counts per prompt version id (only ids with rated feedback appear). */
export async function ratingCountsByVersionIds<TSchema extends Record<string, unknown>>(
  tx: PostgresJsDatabase<TSchema>,
  organizationId: string,
  versionIds: string[],
): Promise<Map<string, { up: number; down: number }>> {
  if (versionIds.length === 0) return new Map();
  const rows = await tx
    .select({
      versionId: promptUsage.promptVersionId,
      up: sql<number>`count(*) filter (where ${feedback.rating} = 'up')::int`,
      down: sql<number>`count(*) filter (where ${feedback.rating} = 'down')::int`,
    })
    .from(feedback)
    .innerJoin(promptUsage, eq(promptUsage.id, feedback.serveId))
    .where(and(eq(feedback.organizationId, organizationId), inArray(promptUsage.promptVersionId, versionIds)))
    .groupBy(promptUsage.promptVersionId);
  return new Map(rows.map((r) => [r.versionId, { up: r.up, down: r.down }]));
}

/** A note plus the skill it was filed against, or null (cross-org / missing / not a note / malformed id). */
export async function findNoteWithPrompt<TSchema extends Record<string, unknown>>(
  tx: PostgresJsDatabase<TSchema>,
  organizationId: string,
  feedbackId: string,
): Promise<{ id: string; promptId: string } | null> {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(feedbackId)) return null;
  const [row] = await tx
    .select({ id: feedback.id, promptId: promptUsage.promptId })
    .from(feedback)
    .innerJoin(promptUsage, eq(promptUsage.id, feedback.serveId))
    .where(and(eq(feedback.organizationId, organizationId), eq(feedback.id, feedbackId), eq(feedback.kind, "note")));
  return row ?? null;
}

export async function markAddressed<TSchema extends Record<string, unknown>>(
  tx: PostgresJsDatabase<TSchema>,
  organizationId: string,
  feedbackId: string,
  versionId: string,
): Promise<void> {
  await tx
    .update(feedback)
    .set({ addressedAt: new Date(), addressedInVersionId: versionId })
    .where(and(eq(feedback.organizationId, organizationId), eq(feedback.id, feedbackId)));
}
