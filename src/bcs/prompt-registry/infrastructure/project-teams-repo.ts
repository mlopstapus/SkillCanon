import { and, eq } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import { projectTeams } from "./schema";

type Tx = PostgresJsDatabase<Record<string, never>>;

export interface InsertProjectTeamParams {
  id: string;
  projectId: string;
  teamId: string;
}

export async function insert(tx: Tx, params: InsertProjectTeamParams) {
  const [row] = await tx.insert(projectTeams).values(params).returning();
  if (!row) {
    throw new Error("Project team insert returned no row.");
  }
  return row;
}

export async function findByProjectAndTeam(tx: Tx, projectId: string, teamId: string) {
  const [row] = await tx
    .select()
    .from(projectTeams)
    .where(and(eq(projectTeams.projectId, projectId), eq(projectTeams.teamId, teamId)));
  return row ?? null;
}

export async function listByProject(tx: Tx, projectId: string) {
  return tx.select().from(projectTeams).where(eq(projectTeams.projectId, projectId));
}

export async function deleteByProjectAndTeam(tx: Tx, projectId: string, teamId: string) {
  const [row] = await tx
    .delete(projectTeams)
    .where(and(eq(projectTeams.projectId, projectId), eq(projectTeams.teamId, teamId)))
    .returning();
  return row ?? null;
}
