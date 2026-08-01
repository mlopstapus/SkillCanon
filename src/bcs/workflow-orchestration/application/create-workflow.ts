import { randomUUID } from "node:crypto";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import { DEFAULT_WEB_AUDIT_CONTEXT, record, type AuditContext } from "@/bcs/audit-compliance";
import type { UserSummary } from "@/bcs/identity-access";
import { getProject } from "@/bcs/prompt-registry";
import { withAudit } from "@/shared/db";
import {
  validateWorkflowSteps,
  WorkflowProjectOrganizationMismatchError,
  type CreateWorkflowParams,
} from "../domain/workflow";
import { insert } from "../infrastructure/workflows-repo";

type Db = PostgresJsDatabase<Record<string, never>>;

export async function createWorkflow(
  db: Db,
  actingUser: UserSummary,
  params: CreateWorkflowParams,
  auditContext: AuditContext = DEFAULT_WEB_AUDIT_CONTEXT,
) {
  const steps = validateWorkflowSteps(params.steps);

  const projectId = params.projectId ?? null;
  if (projectId !== null) {
    const project = await getProject(db, actingUser.orgId, projectId);
    if (!project) {
      throw new WorkflowProjectOrganizationMismatchError(projectId);
    }
  }

  const id = randomUUID();
  const values = {
    id,
    organizationId: actingUser.orgId,
    userId: actingUser.id,
    projectId,
    name: params.name,
    description: params.description ?? null,
    steps,
  };

  return withAudit(
    db,
    (tx) => insert(tx, values),
    (tx) =>
      record(tx, {
        organizationId: actingUser.orgId,
        actorUserId: actingUser.id,
        actorApiKeyId: null,
        action: "workflow.created",
        resourceType: "workflow",
        resourceId: id,
        before: null,
        after: values,
        transport: auditContext.transport,
        sourceIp: auditContext.sourceIp ?? null,
      }),
  );
}
