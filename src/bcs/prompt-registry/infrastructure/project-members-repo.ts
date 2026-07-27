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

export async function deleteByProjectAndUser(tx: Tx, projectId: string, userId: string) {
  const [row] = await tx
    .delete(projectMembers)
    .where(and(eq(projectMembers.projectId, projectId), eq(projectMembers.userId, userId)))
    .returning();
  return row;
}
