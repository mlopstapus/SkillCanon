import { randomUUID } from "node:crypto";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import {
  DEFAULT_WEB_AUDIT_CONTEXT,
  record,
  type AuditContext,
} from "@/bcs/audit-compliance";
import type { UserSummary } from "@/bcs/identity-access";
import { withAudit } from "@/shared/db";
import { isUniqueViolation } from "@/shared/db/postgres-errors";
import { DuplicateProjectRepoError, type AddProjectRepoParams } from "../domain/project-repo";
import { ProjectNotFoundError } from "../domain/project";
import { findByOrgAndId } from "../infrastructure/projects-repo";
import { findByProjectAndUrl, insert } from "../infrastructure/project-repos-repo";
import { assertAuthorizedForOwner } from "./authorize-owner-action";

type Db = PostgresJsDatabase<Record<string, never>>;

/**
 * Links a git repository to a project (023-prompt-registry-views-ui, new
 * capability). Owner-team-admin-gated, modeled directly on
 * `add-collaborator-team.ts` — the same authority level this codebase
 * already requires for every other project-configuration action.
 */
export async function addProjectRepo(
  db: Db,
  actingUser: UserSummary,
  projectId: string,
  params: AddProjectRepoParams,
  auditContext: AuditContext = DEFAULT_WEB_AUDIT_CONTEXT,
) {
  const project = await findByOrgAndId(db, actingUser.orgId, projectId);
  if (!project) {
    throw new ProjectNotFoundError(projectId);
  }

  await assertAuthorizedForOwner(db, actingUser, "team", project.teamId);

  const existing = await findByProjectAndUrl(db, projectId, params.url);
  if (existing) {
    throw new DuplicateProjectRepoError(params.url);
  }

  const id = randomUUID();
  const values = { id, projectId, name: params.name, url: params.url, branch: params.branch ?? "main" };

  try {
    return await withAudit(
      db,
      (tx) => insert(tx, values),
      (tx) =>
        record(tx, {
          organizationId: actingUser.orgId,
          actorUserId: actingUser.id,
          actorApiKeyId: null,
          action: "project_repo.added",
          resourceType: "project_repo",
          resourceId: id,
          before: null,
          after: values,
          transport: auditContext.transport,
          sourceIp: auditContext.sourceIp ?? null,
        }),
    );
  } catch (err) {
    if (isUniqueViolation(err)) {
      throw new DuplicateProjectRepoError(params.url);
    }
    throw err;
  }
}
