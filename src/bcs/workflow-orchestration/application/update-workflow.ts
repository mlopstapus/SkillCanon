import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import { DEFAULT_WEB_AUDIT_CONTEXT, record, type AuditContext } from "@/bcs/audit-compliance";
import type { UserSummary } from "@/bcs/identity-access";
import { withAudit } from "@/shared/db";
import {
  NotAuthorizedError,
  validateWorkflowSteps,
  WorkflowNotFoundError,
  type UpdateWorkflowFields,
} from "../domain/workflow";
import { findByOrgAndId, update, type UpdateWorkflowFieldsRow } from "../infrastructure/workflows-repo";

type Db = PostgresJsDatabase<Record<string, never>>;

/**
 * Self-or-admin (FR-014): the workflow's owner, or an org admin. Only
 * `name`/`description`/`steps` are ever accepted — `organizationId`,
 * `userId`, and `projectId` have no update path (FR-013).
 */
export async function updateWorkflow(
  db: Db,
  actingUser: UserSummary,
  workflowId: string,
  fields: UpdateWorkflowFields,
  auditContext: AuditContext = DEFAULT_WEB_AUDIT_CONTEXT,
) {
  const existing = await findByOrgAndId(db, actingUser.orgId, workflowId);
  if (!existing) {
    throw new WorkflowNotFoundError(workflowId);
  }
  if (actingUser.id !== existing.userId && actingUser.role !== "admin") {
    throw new NotAuthorizedError();
  }

  const rowFields: UpdateWorkflowFieldsRow = {};
  if (fields.name !== undefined) {
    rowFields.name = fields.name;
  }
  if (fields.description !== undefined) {
    rowFields.description = fields.description;
  }
  if (fields.steps !== undefined) {
    rowFields.steps = validateWorkflowSteps(fields.steps);
  }

  let after: Awaited<ReturnType<typeof update>>;

  return withAudit(
    db,
    async (tx) => {
      after = await update(tx, actingUser.orgId, workflowId, rowFields);
      if (!after) {
        throw new WorkflowNotFoundError(workflowId);
      }
      return after;
    },
    (tx) =>
      record(tx, {
        organizationId: actingUser.orgId,
        actorUserId: actingUser.id,
        actorApiKeyId: null,
        action: "workflow.updated",
        resourceType: "workflow",
        resourceId: workflowId,
        before: existing,
        after,
        transport: auditContext.transport,
        sourceIp: auditContext.sourceIp ?? null,
      }),
  );
}
