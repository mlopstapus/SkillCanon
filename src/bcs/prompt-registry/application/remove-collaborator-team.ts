import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import {
  DEFAULT_WEB_AUDIT_CONTEXT,
  record,
  type AuditContext,
} from "@/bcs/audit-compliance";
import type { UserSummary } from "@/bcs/identity-access";
import { withAudit } from "@/shared/db";
import { ProjectNotFoundError } from "../domain/project";
import {
  CollaboratorTeamNotFoundError,
  type AddCollaboratorTeamParams,
} from "../domain/project-team";
import { findByOrgAndId } from "../infrastructure/projects-repo";
import { deleteByProjectAndTeam, findByProjectAndTeam } from "../infrastructure/project-teams-repo";
import { assertAuthorizedForOwner } from "./authorize-owner-action";

type Db = PostgresJsDatabase<Record<string, never>>;

/**
 * Removes a team's collaborator status on a project
 * (022-project-skill-assignment, pulled forward from `001`). Restricted to
 * an admin of the project's owner team, same rule as `addCollaboratorTeam`.
 * No effect on the project's owner-team status, its members, or any
 * existing skill assignment (spec Edge Cases — assignments are not
 * retroactively cleaned up here).
 */
export async function removeCollaboratorTeam(
  db: Db,
  actingUser: UserSummary,
  projectId: string,
  params: AddCollaboratorTeamParams,
  auditContext: AuditContext = DEFAULT_WEB_AUDIT_CONTEXT,
) {
  const project = await findByOrgAndId(db, actingUser.orgId, projectId);
  if (!project) {
    throw new ProjectNotFoundError(projectId);
  }

  await assertAuthorizedForOwner(db, actingUser, "team", project.teamId);

  const existing = await findByProjectAndTeam(db, projectId, params.teamId);
  if (!existing) {
    throw new CollaboratorTeamNotFoundError();
  }

  return withAudit(
    db,
    (tx) => deleteByProjectAndTeam(tx, projectId, params.teamId),
    (tx) =>
      record(tx, {
        organizationId: actingUser.orgId,
        actorUserId: actingUser.id,
        actorApiKeyId: null,
        action: "project_team.removed",
        resourceType: "project_team",
        resourceId: existing.id,
        before: existing,
        after: null,
        transport: auditContext.transport,
        sourceIp: auditContext.sourceIp ?? null,
      }),
  );
}
