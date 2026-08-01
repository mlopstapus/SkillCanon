import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import {
  DEFAULT_WEB_AUDIT_CONTEXT,
  record,
  type AuditContext,
} from "@/bcs/audit-compliance";
import type { UserSummary } from "@/bcs/identity-access";
import { withAudit } from "@/shared/db";
import { ProjectRepoNotFoundError } from "../domain/project-repo";
import { ProjectNotFoundError } from "../domain/project";
import { findByOrgAndId } from "../infrastructure/projects-repo";
import { deleteByProjectAndId, findByProjectAndId } from "../infrastructure/project-repos-repo";
import { assertAuthorizedForOwner } from "./authorize-owner-action";

type Db = PostgresJsDatabase<Record<string, never>>;

export async function removeProjectRepo(
  db: Db,
  actingUser: UserSummary,
  projectId: string,
  repoId: string,
  auditContext: AuditContext = DEFAULT_WEB_AUDIT_CONTEXT,
) {
  const project = await findByOrgAndId(db, actingUser.orgId, projectId);
  if (!project) {
    throw new ProjectNotFoundError(projectId);
  }

  await assertAuthorizedForOwner(db, actingUser, "team", project.teamId);

  const existing = await findByProjectAndId(db, projectId, repoId);
  if (!existing) {
    throw new ProjectRepoNotFoundError(projectId, repoId);
  }

  return withAudit(
    db,
    (tx) => deleteByProjectAndId(tx, projectId, repoId),
    (tx) =>
      record(tx, {
        organizationId: actingUser.orgId,
        actorUserId: actingUser.id,
        actorApiKeyId: null,
        action: "project_repo.removed",
        resourceType: "project_repo",
        resourceId: repoId,
        before: existing,
        after: null,
        transport: auditContext.transport,
        sourceIp: auditContext.sourceIp ?? null,
      }),
  );
}
