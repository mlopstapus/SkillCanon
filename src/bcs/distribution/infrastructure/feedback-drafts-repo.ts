import { and, desc, eq, inArray } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import type { DraftStatus, ImprovementDraft } from "../domain/improvement-draft";
import { feedback, feedbackDrafts, thirdPartyOptIn } from "./schema";

type Db<T extends Record<string, unknown>> = PostgresJsDatabase<T>;

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function toDraft(row: typeof feedbackDrafts.$inferSelect): ImprovementDraft {
  return {
    id: row.id,
    promptId: row.promptId,
    baseVersionId: row.baseVersionId,
    status: row.status,
    proposedContent: row.proposedContent,
    rationale: row.rationale,
    sourceFeedbackIds: row.sourceFeedbackIds,
    model: row.model,
    createdBy: row.createdBy,
    createdAt: row.createdAt,
    decidedAt: row.decidedAt,
    acceptedVersionId: row.acceptedVersionId,
  };
}

export interface InsertDraftParams {
  id: string;
  organizationId: string;
  promptId: string;
  baseVersionId: string;
  proposedContent: string;
  rationale: string;
  sourceFeedbackIds: string[];
  model: string;
  createdBy: string;
}

export async function insertDraft<T extends Record<string, unknown>>(tx: Db<T>, params: InsertDraftParams): Promise<ImprovementDraft> {
  const [row] = await tx.insert(feedbackDrafts).values(params).returning();
  if (!row) throw new Error("feedback_drafts insert returned no row.");
  return toDraft(row);
}

export async function findDraft<T extends Record<string, unknown>>(
  tx: Db<T>,
  organizationId: string,
  draftId: string,
): Promise<ImprovementDraft | null> {
  if (!UUID_PATTERN.test(draftId)) return null;
  const [row] = await tx
    .select()
    .from(feedbackDrafts)
    .where(and(eq(feedbackDrafts.organizationId, organizationId), eq(feedbackDrafts.id, draftId)));
  return row ? toDraft(row) : null;
}

export async function listDraftsForPrompt<T extends Record<string, unknown>>(
  tx: Db<T>,
  organizationId: string,
  promptId: string,
): Promise<ImprovementDraft[]> {
  const rows = await tx
    .select()
    .from(feedbackDrafts)
    .where(and(eq(feedbackDrafts.organizationId, organizationId), eq(feedbackDrafts.promptId, promptId)))
    .orderBy(desc(feedbackDrafts.createdAt));
  return rows.map(toDraft);
}

export async function decideDraft<T extends Record<string, unknown>>(
  tx: Db<T>,
  organizationId: string,
  draftId: string,
  status: Exclude<DraftStatus, "pending">,
  decidedBy: string,
  acceptedVersionId: string | null,
): Promise<void> {
  await tx
    .update(feedbackDrafts)
    .set({ status, decidedBy, decidedAt: new Date(), acceptedVersionId })
    .where(and(eq(feedbackDrafts.organizationId, organizationId), eq(feedbackDrafts.id, draftId)));
}

/** Marks every given note addressed by `versionId` (used when a draft built from them is accepted). */
export async function markNotesAddressed<T extends Record<string, unknown>>(
  tx: Db<T>,
  organizationId: string,
  feedbackIds: string[],
  versionId: string,
): Promise<void> {
  if (feedbackIds.length === 0) return;
  await tx
    .update(feedback)
    .set({ addressedAt: new Date(), addressedInVersionId: versionId })
    .where(and(eq(feedback.organizationId, organizationId), inArray(feedback.id, feedbackIds)));
}

export async function getOptIn<T extends Record<string, unknown>>(tx: Db<T>, organizationId: string): Promise<boolean> {
  const [row] = await tx.select().from(thirdPartyOptIn).where(eq(thirdPartyOptIn.organizationId, organizationId));
  return row?.enabled ?? false;
}

export async function upsertOptIn<T extends Record<string, unknown>>(
  tx: Db<T>,
  organizationId: string,
  enabled: boolean,
  updatedBy: string,
): Promise<void> {
  await tx
    .insert(thirdPartyOptIn)
    .values({ organizationId, enabled, updatedBy })
    .onConflictDoUpdate({ target: thirdPartyOptIn.organizationId, set: { enabled, updatedBy, updatedAt: new Date() } });
}
