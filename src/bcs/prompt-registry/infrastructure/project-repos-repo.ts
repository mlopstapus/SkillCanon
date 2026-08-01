import { and, eq } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import { projectRepos } from "./schema";

type Tx = PostgresJsDatabase<Record<string, never>>;

export interface InsertProjectRepoParams {
  id: string;
  projectId: string;
  name: string;
  url: string;
  branch: string;
}

export async function insert(tx: Tx, params: InsertProjectRepoParams) {
  const [row] = await tx.insert(projectRepos).values(params).returning();
  if (!row) {
    throw new Error("Project repo insert returned no row.");
  }
  return row;
}

export async function findByProjectAndUrl(tx: Tx, projectId: string, url: string) {
  const [row] = await tx
    .select()
    .from(projectRepos)
    .where(and(eq(projectRepos.projectId, projectId), eq(projectRepos.url, url)));
  return row ?? null;
}

export async function findByProjectAndId(tx: Tx, projectId: string, repoId: string) {
  const [row] = await tx
    .select()
    .from(projectRepos)
    .where(and(eq(projectRepos.projectId, projectId), eq(projectRepos.id, repoId)));
  return row ?? null;
}

export async function deleteByProjectAndId(tx: Tx, projectId: string, repoId: string) {
  const [row] = await tx
    .delete(projectRepos)
    .where(and(eq(projectRepos.projectId, projectId), eq(projectRepos.id, repoId)))
    .returning();
  return row ?? null;
}

export async function listByProject(tx: Tx, projectId: string) {
  return tx.select().from(projectRepos).where(eq(projectRepos.projectId, projectId));
}
