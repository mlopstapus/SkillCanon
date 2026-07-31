import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import {
  DEFAULT_WEB_AUDIT_CONTEXT,
  record,
  type AuditContext,
} from "@/bcs/audit-compliance";
import type { UserSummary } from "@/bcs/identity-access";
import { withAudit } from "@/shared/db";
import { ProjectNotFoundError } from "../domain/project";
import { ProjectSkillAssignmentNotFoundError } from "../domain/project-skill-assignment";
import { findByOrgAndId } from "../infrastructure/projects-repo";
import {
  deleteByProjectAndSkill,
  findByProjectAndSkill,
} from "../infrastructure/project-skill-assignments-repo";
import { assertAuthorizedForOwner } from "./authorize-owner-action";

type Db = PostgresJsDatabase<Record<string, never>>;

/**
 * Removes a skill's assignment from a project (022-project-skill-assignment,
 * PDR-016). Restricted to an admin of the project's owner team, same rule
 * as `assignSkillToProject`. No effect on the skill itself or any other
 * project's assignment of it.
 */
export async function unassignSkillFromProject(
  db: Db,
  actingUser: UserSummary,
  projectId: string,
  skillId: string,
  auditContext: AuditContext = DEFAULT_WEB_AUDIT_CONTEXT,
) {
  const project = await findByOrgAndId(db, actingUser.orgId, projectId);
  if (!project) {
    throw new ProjectNotFoundError(projectId);
  }

  await assertAuthorizedForOwner(db, actingUser, "team", project.teamId);

  const existing = await findByProjectAndSkill(db, projectId, skillId);
  if (!existing) {
    throw new ProjectSkillAssignmentNotFoundError();
  }

  return withAudit(
    db,
    (tx) => deleteByProjectAndSkill(tx, projectId, skillId),
    (tx) =>
      record(tx, {
        organizationId: actingUser.orgId,
        actorUserId: actingUser.id,
        actorApiKeyId: null,
        action: "project_skill_assignment.unassigned",
        resourceType: "project_skill_assignment",
        resourceId: existing.id,
        before: existing,
        after: null,
        transport: auditContext.transport,
        sourceIp: auditContext.sourceIp ?? null,
      }),
  );
}
