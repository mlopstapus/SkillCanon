import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import { DEFAULT_WEB_AUDIT_CONTEXT, record, type AuditContext } from "@/bcs/audit-compliance";
import { getTeam, NotAuthorizedError } from "@/bcs/identity-access";
import { getPromptById, getPromptVersion } from "@/bcs/prompt-registry";
import { withAudit } from "@/shared/db";
import { FeedbackNotFoundError, FeedbackVersionMismatchError } from "../domain/feedback";
import { findNoteWithPrompt, markAddressed } from "../infrastructure/feedback-repo";

type Db = PostgresJsDatabase<Record<string, never>>;

export interface FeedbackTriager {
  organizationId: string;
  userId: string;
  role: "admin" | "member";
}

/**
 * Marks a note addressed and links the version that addressed it. Only the
 * skill's owner (the user owner, the owning team's owner, or an org admin)
 * may; re-marking replaces the link. A note in another organization is
 * `FeedbackNotFoundError`, same as a missing one.
 */
export async function markFeedbackAddressed(
  db: Db,
  actor: FeedbackTriager,
  feedbackId: string,
  versionId: string,
  auditContext: AuditContext = DEFAULT_WEB_AUDIT_CONTEXT,
): Promise<void> {
  const note = await findNoteWithPrompt(db, actor.organizationId, feedbackId);
  if (!note) throw new FeedbackNotFoundError(feedbackId);
  const prompt = await getPromptById(db, actor.organizationId, note.promptId);
  if (!prompt) throw new FeedbackNotFoundError(feedbackId);

  // Re-derived locally: prompt-registry's owner check is not exported (same two-line rule).
  const isOwner =
    actor.role === "admin" ||
    (prompt.ownerType === "user" && prompt.ownerId === actor.userId) ||
    (prompt.ownerType === "team" && (await getTeam(db, actor.organizationId, prompt.ownerId)).ownerId === actor.userId);
  if (!isOwner) throw new NotAuthorizedError();

  const version = await getPromptVersion(db, actor.organizationId, versionId);
  if (!version || version.promptId !== prompt.id) throw new FeedbackVersionMismatchError();

  await withAudit(
    db,
    (tx) => markAddressed(tx, actor.organizationId, feedbackId, versionId),
    (tx) =>
      record(tx, {
        organizationId: actor.organizationId,
        actorUserId: actor.userId,
        actorApiKeyId: null,
        action: "feedback.updated",
        resourceType: "feedback",
        resourceId: feedbackId,
        before: null,
        after: { addressedInVersionId: versionId },
        transport: auditContext.transport,
        sourceIp: auditContext.sourceIp ?? null,
      }),
  );
}
