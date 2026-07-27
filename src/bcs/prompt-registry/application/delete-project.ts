import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import {
  DEFAULT_WEB_AUDIT_CONTEXT,
  record,
  type AuditContext,
} from "@/bcs/audit-compliance";
import { withAudit } from "@/shared/db";
import { ProjectNotFoundError, type ProjectActor } from "../domain/project";
import { deleteByOrgAndId, findByOrgAndId } from "../infrastructure/projects-repo";

type Db = PostgresJsDatabase<Record<string, never>>;

export async function deleteProject(
  db: Db,
  actor: ProjectActor,
  projectId: string,
  auditContext: AuditContext = DEFAULT_WEB_AUDIT_CONTEXT,
): Promise<boolean> {
  let before: Awaited<ReturnType<typeof findByOrgAndId>>;

  await withAudit(
    db,
    async (tx) => {
      before = await findByOrgAndId(tx, actor.organizationId, projectId);
      if (!before) {
        throw new ProjectNotFoundError(projectId);
      }
      const deleted = await deleteByOrgAndId(tx, actor.organizationId, projectId);
      if (!deleted) {
        throw new ProjectNotFoundError(projectId);
      }
      return deleted;
    },
    (tx) =>
      record(tx, {
        organizationId: actor.organizationId,
        actorUserId: actor.userId,
        actorApiKeyId: null,
        action: "project.deleted",
        resourceType: "project",
        resourceId: projectId,
        before,
        after: null,
        transport: auditContext.transport,
        sourceIp: auditContext.sourceIp ?? null,
      }),
  );

  return true;
}
