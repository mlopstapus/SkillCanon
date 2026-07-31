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
import { ProjectNotFoundError } from "../domain/project";
import {
  DuplicateProjectSkillAssignmentError,
  PersonalSkillNotAssignableError,
  SkillNotEligibleForProjectError,
  type AssignSkillToProjectParams,
} from "../domain/project-skill-assignment";
import { SourceSkillNotFoundError } from "../domain/subscription";
import { findByOrgAndId } from "../infrastructure/projects-repo";
import { findByProjectAndTeam } from "../infrastructure/project-teams-repo";
import { findByProjectAndSkill, insert } from "../infrastructure/project-skill-assignments-repo";
import { findPromptByOrgAndId } from "../infrastructure/prompts-repo";
import { assertAuthorizedForOwner } from "./authorize-owner-action";

type Db = PostgresJsDatabase<Record<string, never>>;

/**
 * Assigns a skill to a project (022-project-skill-assignment, PDR-016). A
 * plain Prompt Registry catalog fact — never a Governance policy. Eligible
 * only when the skill is owned by the project's owner team or one of its
 * collaborator teams; a personally-owned skill is always rejected,
 * regardless of the acting user's relationship to it or the project
 * (FR-004). Restricted to an admin of the project's owner team, same rule
 * as collaborator-team management.
 */
export async function assignSkillToProject(
  db: Db,
  actingUser: UserSummary,
  projectId: string,
  skillId: string,
  params: AssignSkillToProjectParams,
  auditContext: AuditContext = DEFAULT_WEB_AUDIT_CONTEXT,
) {
  const project = await findByOrgAndId(db, actingUser.orgId, projectId);
  if (!project) {
    throw new ProjectNotFoundError(projectId);
  }

  const skill = await findPromptByOrgAndId(db, actingUser.orgId, skillId);
  if (!skill) {
    throw new SourceSkillNotFoundError();
  }

  await assertAuthorizedForOwner(db, actingUser, "team", project.teamId);

  if (skill.ownerType === "user") {
    throw new PersonalSkillNotAssignableError();
  }

  const isOwnerTeam = skill.ownerId === project.teamId;
  const isCollaboratorTeam = isOwnerTeam
    ? false
    : Boolean(await findByProjectAndTeam(db, projectId, skill.ownerId));
  if (!isOwnerTeam && !isCollaboratorTeam) {
    throw new SkillNotEligibleForProjectError();
  }

  const existing = await findByProjectAndSkill(db, projectId, skillId);
  if (existing) {
    throw new DuplicateProjectSkillAssignmentError();
  }

  const id = randomUUID();
  const values = {
    id,
    organizationId: actingUser.orgId,
    projectId,
    skillId,
    requirement: params.requirement,
  };

  try {
    return await withAudit(
      db,
      (tx) => insert(tx, values),
      (tx) =>
        record(tx, {
          organizationId: actingUser.orgId,
          actorUserId: actingUser.id,
          actorApiKeyId: null,
          action: "project_skill_assignment.assigned",
          resourceType: "project_skill_assignment",
          resourceId: id,
          before: null,
          after: values,
          transport: auditContext.transport,
          sourceIp: auditContext.sourceIp ?? null,
        }),
    );
  } catch (err) {
    if (isUniqueViolation(err)) {
      throw new DuplicateProjectSkillAssignmentError();
    }
    throw err;
  }
}
