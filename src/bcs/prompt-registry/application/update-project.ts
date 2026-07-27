import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import {
  DEFAULT_WEB_AUDIT_CONTEXT,
  record,
  type AuditContext,
} from "@/bcs/audit-compliance";
import { withAudit } from "@/shared/db";
import { isUniqueViolation } from "@/shared/db/postgres-errors";
import {
  DuplicateProjectNameError,
  ProjectNotFoundError,
  ProjectUserNotFoundError,
  type ProjectActor,
  type ProjectIdentityVerifier,
  type UpdateProjectFields,
} from "../domain/project";
import { findByOrgAndId, update } from "../infrastructure/projects-repo";

type Db = PostgresJsDatabase<Record<string, never>>;

export async function updateProject(
  db: Db,
  actor: ProjectActor,
  projectId: string,
  fields: UpdateProjectFields,
  verifier: ProjectIdentityVerifier,
  auditContext: AuditContext = DEFAULT_WEB_AUDIT_CONTEXT,
) {
  if (
    fields.leadUserId &&
    !(await verifier.userBelongsToOrganization(actor.organizationId, fields.leadUserId))
  ) {
    throw new ProjectUserNotFoundError(fields.leadUserId);
  }

  let before: Awaited<ReturnType<typeof findByOrgAndId>>;
  let after: Awaited<ReturnType<typeof update>>;

  try {
    return await withAudit(
      db,
      async (tx) => {
        before = await findByOrgAndId(tx, actor.organizationId, projectId);
        if (!before) {
          throw new ProjectNotFoundError(projectId);
        }
        after = await update(tx, actor.organizationId, projectId, fields);
        if (!after) {
          throw new ProjectNotFoundError(projectId);
        }
        return after;
      },
      (tx) =>
        record(tx, {
          organizationId: actor.organizationId,
          actorUserId: actor.userId,
          actorApiKeyId: null,
          action: "project.updated",
          resourceType: "project",
          resourceId: projectId,
          before,
          after,
          transport: auditContext.transport,
          sourceIp: auditContext.sourceIp ?? null,
        }),
    );
  } catch (err) {
    if (isUniqueViolation(err) && fields.name) {
      throw new DuplicateProjectNameError(fields.name);
    }
    throw err;
  }
}
