import { and, asc, eq } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import { projectMembers } from "./schema";

type Tx = PostgresJsDatabase<Record<string, never>>;

export interface InsertProjectMemberParams {
  id: string;
  projectId: string;
  userId: string;
  role: string;
}

export async function insert(tx: Tx, params: InsertProjectMemberParams) {
  const [row] = await tx.insert(projectMembers).values(params).returning();
  if (!row) {
    throw new Error("Project member insert returned no row.");
  }
  return row;
}

export async function findByProjectAndUser(tx: Tx, projectId: string, userId: string) {
  const [row] = await tx
    .select()
    .from(projectMembers)
    .where(and(eq(projectMembers.projectId, projectId), eq(projectMembers.userId, userId)));
  return row;
}

export async function listByProject(tx: Tx, projectId: string) {
  return tx
    .select()
    .from(projectMembers)
    .where(eq(projectMembers.projectId, projectId))
    .orderBy(asc(projectMembers.createdAt));
}

/**
 * Every project id a user belongs to, across the whole organization —
 * powers the accessible-prompts query's project-subscription branch
 * (023-prompt-registry-views-ui) — no existing query returns this
 * direction (the rest are all scoped to one specific project already).
 */
export async function listProjectIdsForUser(tx: Tx, userId: string): Promise<string[]> {
  const rows = await tx
    .select({ projectId: projectMembers.projectId })
    .from(projectMembers)
    .where(eq(projectMembers.userId, userId));
  return rows.map((row) => row.projectId);
}

export async function deleteByProjectAndUser(tx: Tx, projectId: string, userId: string) {
  const [row] = await tx
    .delete(projectMembers)
    .where(and(eq(projectMembers.projectId, projectId), eq(projectMembers.userId, userId)))
    .returning();
  return row;
}
