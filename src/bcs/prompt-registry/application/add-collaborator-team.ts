import { randomUUID } from "node:crypto";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import {
  DEFAULT_WEB_AUDIT_CONTEXT,
  record,
  type AuditContext,
} from "@/bcs/audit-compliance";
import { getTeam, type UserSummary } from "@/bcs/identity-access";
import { withAudit } from "@/shared/db";
import { isUniqueViolation } from "@/shared/db/postgres-errors";
import { ProjectNotFoundError } from "../domain/project";
import {
  DuplicateCollaboratorTeamError,
  OwnerTeamCannotBeCollaboratorError,
  ProjectTeamOrgMismatchError,
  type AddCollaboratorTeamParams,
} from "../domain/project-team";
import { findByOrgAndId } from "../infrastructure/projects-repo";
import { findByProjectAndTeam, insert } from "../infrastructure/project-teams-repo";
import { assertAuthorizedForOwner } from "./authorize-owner-action";

type Db = PostgresJsDatabase<Record<string, never>>;

/**
 * Adds a team as a project collaborator (022-project-skill-assignment,
 * pulled forward from `backlog/006-prompt-registry/001-project-model-and-membership.md`
 * per PDR-016). Restricted to an admin of the project's *owner* team —
 * reuses `assertAuthorizedForOwner` (the same org-admin-or-team-owner rule
 * `020-prompt-sharing` already established), rather than a duplicate check.
 */
export async function addCollaboratorTeam(
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

  if (params.teamId === project.teamId) {
    throw new OwnerTeamCannotBeCollaboratorError();
  }

  await assertAuthorizedForOwner(db, actingUser, "team", project.teamId);

  // The named team must belong to the same organization as the project.
  // `assertAuthorizedForOwner` only validates `project.teamId` (the acting
  // user's authority), not `params.teamId` (the target) — so that check is
  // separate here, unlike subscribe/fork where subscriber and authorized
  // team are the same id. `getTeam` is itself organization-scoped, so a
  // cross-org or nonexistent id throws the same way (mirrors
  // `assertAuthorizedForOwner`'s own `getTeam`-based cross-org check).
  try {
    await getTeam(db, actingUser.orgId, params.teamId);
  } catch {
    throw new ProjectTeamOrgMismatchError();
  }

  const existing = await findByProjectAndTeam(db, projectId, params.teamId);
  if (existing) {
    throw new DuplicateCollaboratorTeamError();
  }

  const id = randomUUID();
  const values = { id, projectId, teamId: params.teamId };

  try {
    return await withAudit(
      db,
      (tx) => insert(tx, values),
      (tx) =>
        record(tx, {
          organizationId: actingUser.orgId,
          actorUserId: actingUser.id,
          actorApiKeyId: null,
          action: "project_team.added",
          resourceType: "project_team",
          resourceId: id,
          before: null,
          after: values,
          transport: auditContext.transport,
          sourceIp: auditContext.sourceIp ?? null,
        }),
    );
  } catch (err) {
    if (isUniqueViolation(err)) {
      throw new DuplicateCollaboratorTeamError();
    }
    throw err;
  }
}
