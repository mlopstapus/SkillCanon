import { and, eq } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import type { ProjectSkillRequirement } from "../domain/project-skill-assignment";
import { projectSkillAssignments, prompts } from "./schema";

type Tx = PostgresJsDatabase<Record<string, never>>;

export interface InsertProjectSkillAssignmentParams {
  id: string;
  organizationId: string;
  projectId: string;
  skillId: string;
  requirement: ProjectSkillRequirement;
}

export async function insert(tx: Tx, params: InsertProjectSkillAssignmentParams) {
  const [row] = await tx.insert(projectSkillAssignments).values(params).returning();
  if (!row) {
    throw new Error("Project skill assignment insert returned no row.");
  }
  return row;
}

export async function findByProjectAndSkill(tx: Tx, projectId: string, skillId: string) {
  const [row] = await tx
    .select()
    .from(projectSkillAssignments)
    .where(
      and(
        eq(projectSkillAssignments.projectId, projectId),
        eq(projectSkillAssignments.skillId, skillId),
      ),
    );
  return row ?? null;
}

export async function deleteByProjectAndSkill(tx: Tx, projectId: string, skillId: string) {
  const [row] = await tx
    .delete(projectSkillAssignments)
    .where(
      and(
        eq(projectSkillAssignments.projectId, projectId),
        eq(projectSkillAssignments.skillId, skillId),
      ),
    )
    .returning();
  return row ?? null;
}

/**
 * Every skill assigned to a project (both requirement levels), joined to
 * `prompts` for the `listPrompts` `projectId` union (research.md §4).
 */
export async function listByProject(tx: Tx, projectId: string) {
  const rows = await tx
    .select({ prompt: prompts })
    .from(projectSkillAssignments)
    .innerJoin(prompts, eq(prompts.id, projectSkillAssignments.skillId))
    .where(eq(projectSkillAssignments.projectId, projectId));
  return rows.map((row) => row.prompt);
}

/**
 * Flat skill-name list for `requirement = 'required'` assignments only — a
 * direct catalog read, no team-chain resolution (FR-009/FR-010/FR-011).
 */
export async function listRequiredSkillNamesByProject(
  tx: Tx,
  organizationId: string,
  projectId: string,
) {
  const rows = await tx
    .select({ name: prompts.name })
    .from(projectSkillAssignments)
    .innerJoin(prompts, eq(prompts.id, projectSkillAssignments.skillId))
    .where(
      and(
        eq(projectSkillAssignments.organizationId, organizationId),
        eq(projectSkillAssignments.projectId, projectId),
        eq(projectSkillAssignments.requirement, "required"),
      ),
    );
  return rows.map((row) => row.name);
}
