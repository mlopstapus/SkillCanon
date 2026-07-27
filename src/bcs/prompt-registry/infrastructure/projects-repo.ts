import { and, asc, eq } from "drizzle-orm";
import { sql } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import type { UpdateProjectFields } from "../domain/project";
import { projects } from "./schema";

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

export async function listByTeam(tx: Tx, organizationId: string, teamId: string) {
  return tx
    .select()
    .from(projects)
    .where(and(eq(projects.organizationId, organizationId), eq(projects.teamId, teamId)))
    .orderBy(asc(projects.name));
}
