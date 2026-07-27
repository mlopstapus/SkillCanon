import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import {
  DEFAULT_WEB_AUDIT_CONTEXT,
  record,
  type AuditContext,
} from "@/bcs/audit-compliance";
import { withAudit } from "@/shared/db";
import {
  ProjectMemberNotFoundError,
  ProjectNotFoundError,
  type ProjectActor,
} from "../domain/project";
import { deleteByProjectAndUser, findByProjectAndUser } from "../infrastructure/project-members-repo";
import { findByOrgAndId } from "../infrastructure/projects-repo";

type Db = PostgresJsDatabase<Record<string, never>>;

export async function removeProjectMember(
  db: Db,
  actor: ProjectActor,
  projectId: string,
  userId: string,
  auditContext: AuditContext = DEFAULT_WEB_AUDIT_CONTEXT,
): Promise<boolean> {
  const project = await findByOrgAndId(db, actor.organizationId, projectId);
  if (!project) {
    throw new ProjectNotFoundError(projectId);
  }

  let before: NonNullable<Awaited<ReturnType<typeof findByProjectAndUser>>>;
  await withAudit(
    db,
    async (tx) => {
      const current = await findByProjectAndUser(tx, projectId, userId);
      if (!current) {
        throw new ProjectMemberNotFoundError(projectId, userId);
      }
      before = current;
      const deleted = await deleteByProjectAndUser(tx, projectId, userId);
      if (!deleted) {
        throw new ProjectMemberNotFoundError(projectId, userId);
      }
      return deleted;
    },
    (tx) =>
      record(tx, {
        organizationId: actor.organizationId,
        actorUserId: actor.userId,
        actorApiKeyId: null,
        action: "project_member.deleted",
        resourceType: "project_member",
        resourceId: before.id,
        before,
        after: null,
        transport: auditContext.transport,
        sourceIp: auditContext.sourceIp ?? null,
      }),
  );

  return true;
}
