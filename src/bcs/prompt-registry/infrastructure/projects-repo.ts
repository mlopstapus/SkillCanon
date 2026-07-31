import { and, asc, eq, or } from "drizzle-orm";
import { sql } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import type { UpdateProjectFields } from "../domain/project";
import { projects, projectTeams } from "./schema";

type Tx = PostgresJsDatabase<Record<string, never>>;

export interface InsertProjectParams {
  id: string;
  organizationId: string;
  teamId: string;
  leadUserId: string | null;
  name: string;
  slug: string;
  description: string | null;
}

export async function insert(tx: Tx, params: InsertProjectParams) {
  const [row] = await tx.insert(projects).values(params).returning();
  if (!row) {
    throw new Error("Project insert returned no row.");
  }
  return row;
}

export async function findByOrgAndId(tx: Tx, organizationId: string, projectId: string) {
  const [row] = await tx
    .select()
    .from(projects)
    .where(and(eq(projects.organizationId, organizationId), eq(projects.id, projectId)));
  return row;
}

export async function findByOrgAndName(tx: Tx, organizationId: string, name: string) {
  const [row] = await tx
    .select()
    .from(projects)
    .where(and(eq(projects.organizationId, organizationId), eq(projects.name, name)));
  return row;
}

export async function findByOrgAndSlug(tx: Tx, organizationId: string, slug: string) {
  const [row] = await tx
    .select()
    .from(projects)
    .where(and(eq(projects.organizationId, organizationId), eq(projects.slug, slug)));
  return row;
}

export async function update(
  tx: Tx,
  organizationId: string,
  projectId: string,
  fields: UpdateProjectFields,
) {
  const [row] = await tx
    .update(projects)
    .set({ ...fields, updatedAt: sql`now()` })
    .where(and(eq(projects.organizationId, organizationId), eq(projects.id, projectId)))
    .returning();
  return row;
}

export async function deleteByOrgAndId(tx: Tx, organizationId: string, projectId: string) {
  const [row] = await tx
    .delete(projects)
    .where(and(eq(projects.organizationId, organizationId), eq(projects.id, projectId)))
    .returning();
  return row;
}

export async function listByOrganization(tx: Tx, organizationId: string) {
  return tx
    .select()
    .from(projects)
    .where(eq(projects.organizationId, organizationId))
    .orderBy(asc(projects.name));
}

/**
 * Matches a project where `teamId` is either the project's owner team
 * (`projects.team_id`) or one of its collaborator teams (`project_teams`)
 * — "a team's projects" per `001`'s original requirement and FR-024
 * (022-project-skill-assignment).
 */
export async function listByTeam(tx: Tx, organizationId: string, teamId: string) {
  const rows = await tx
    .selectDistinct({ project: projects })
    .from(projects)
    .leftJoin(
      projectTeams,
      and(eq(projectTeams.projectId, projects.id), eq(projectTeams.teamId, teamId)),
    )
    .where(
      and(
        eq(projects.organizationId, organizationId),
        or(eq(projects.teamId, teamId), eq(projectTeams.teamId, teamId)),
      ),
    )
    .orderBy(asc(projects.name));
  return rows.map((row) => row.project);
}
