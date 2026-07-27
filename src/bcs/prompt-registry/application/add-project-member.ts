import { randomUUID } from "node:crypto";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import {
  DEFAULT_WEB_AUDIT_CONTEXT,
  record,
  type AuditContext,
} from "@/bcs/audit-compliance";
import { withAudit } from "@/shared/db";
import { isUniqueViolation } from "@/shared/db/postgres-errors";
import {
  DuplicateProjectMemberError,
  ProjectNotFoundError,
  ProjectUserNotFoundError,
  type AddProjectMemberParams,
  type ProjectActor,
  type ProjectIdentityVerifier,
} from "../domain/project";
import { insert } from "../infrastructure/project-members-repo";
import { findByOrgAndId } from "../infrastructure/projects-repo";

type Db = PostgresJsDatabase<Record<string, never>>;

export async function addProjectMember(
  db: Db,
  actor: ProjectActor,
  params: AddProjectMemberParams,
  verifier: ProjectIdentityVerifier,
  auditContext: AuditContext = DEFAULT_WEB_AUDIT_CONTEXT,
) {
  const project = await findByOrgAndId(db, actor.organizationId, params.projectId);
  if (!project) {
    throw new ProjectNotFoundError(params.projectId);
  }
  if (!(await verifier.userBelongsToOrganization(actor.organizationId, params.userId))) {
    throw new ProjectUserNotFoundError(params.userId);
  }

  const id = randomUUID();
  const values = {
    id,
    projectId: params.projectId,
    userId: params.userId,
    role: params.role ?? "member",
  };

  try {
    return await withAudit(
      db,
      (tx) => insert(tx, values),
      (tx) =>
        record(tx, {
          organizationId: actor.organizationId,
          actorUserId: actor.userId,
          actorApiKeyId: null,
          action: "project_member.created",
          resourceType: "project_member",
          resourceId: id,
          before: null,
          after: values,
          transport: auditContext.transport,
          sourceIp: auditContext.sourceIp ?? null,
        }),
    );
  } catch (err) {
    if (isUniqueViolation(err)) {
      throw new DuplicateProjectMemberError(params.projectId, params.userId);
    }
    throw err;
  }
}
