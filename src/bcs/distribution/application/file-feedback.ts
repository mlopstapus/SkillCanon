import { randomUUID } from "node:crypto";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import { DEFAULT_WEB_AUDIT_CONTEXT, record, type AuditContext } from "@/bcs/audit-compliance";
import { withAudit } from "@/shared/db";
import {
  ServeNotFoundError,
  validateFeedback,
  type Feedback,
  type FileFeedbackParams,
} from "../domain/feedback";
import { insert } from "../infrastructure/feedback-repo";
import { findById } from "../infrastructure/prompt-usage-repo";

type Db = PostgresJsDatabase<Record<string, never>>;

export interface FeedbackActor {
  organizationId: string;
  userId: string;
}

/**
 * Files feedback against a serve in the caller's organization. A serve id
 * outside the organization is `ServeNotFoundError`, same as a missing one.
 * The row stores the serve id only — never a copy of the skill text.
 */
export async function fileFeedback(
  db: Db,
  actor: FeedbackActor,
  params: FileFeedbackParams,
  auditContext: AuditContext = DEFAULT_WEB_AUDIT_CONTEXT,
): Promise<Feedback> {
  const text = validateFeedback(params);
  const serve = await findById(db, actor.organizationId, params.serveId);
  if (!serve) {
    throw new ServeNotFoundError(params.serveId);
  }

  // Generated up front so the audit closure can name the row (withAudit does not pass the mutation result on).
  const feedbackId = randomUUID();
  const values = {
    id: feedbackId,
    organizationId: actor.organizationId,
    serveId: serve.serveId,
    userId: actor.userId,
    kind: params.kind,
    rating: params.rating ?? null,
    text,
  };
  return withAudit(
    db,
    (tx) => insert(tx, values),
    (tx) =>
      record(tx, {
        organizationId: actor.organizationId,
        actorUserId: actor.userId,
        actorApiKeyId: null,
        action: "feedback.created",
        resourceType: "feedback",
        resourceId: feedbackId,
        before: null,
        after: { serveId: serve.serveId, kind: params.kind, rating: values.rating, hasText: text !== null },
        transport: auditContext.transport,
        sourceIp: auditContext.sourceIp ?? null,
      }),
  );
}
