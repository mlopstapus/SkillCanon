import { and, asc, count, eq } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import type { UpdateObjectiveFields } from "../domain/objective";
import { objectives } from "./schema";

type Tx = PostgresJsDatabase<Record<string, never>>;

export interface InsertObjectiveParams {
  id: string;
  organizationId: string;
  teamId: string | null;
  projectId: string | null;
  userId: string | null;
  title: string;
  description: string | null;
  parentObjectiveId: string | null;
  status: string;
}

export async function insert(tx: Tx, params: InsertObjectiveParams) {
  const [row] = await tx
    .insert(objectives)
    .values({ ...params, isInherited: false })
    .returning();
  if (!row) {
    throw new Error("Objective insert returned no row.");
  }
  return row;
}

export async function findByOrgAndId(tx: Tx, organizationId: string, objectiveId: string) {
  const [row] = await tx
    .select()
    .from(objectives)
    .where(and(eq(objectives.organizationId, organizationId), eq(objectives.id, objectiveId)));
  return row;
}

export async function update(
  tx: Tx,
  organizationId: string,
  objectiveId: string,
  fields: UpdateObjectiveFields,
) {
  const [row] = await tx
    .update(objectives)
    .set(fields)
    .where(and(eq(objectives.organizationId, organizationId), eq(objectives.id, objectiveId)))
    .returning();
  return row;
}

export async function hardDelete(tx: Tx, organizationId: string, objectiveId: string) {
  const [row] = await tx
    .delete(objectives)
    .where(and(eq(objectives.organizationId, organizationId), eq(objectives.id, objectiveId)))
    .returning();
  return row;
}

export async function listActiveByTeam(tx: Tx, organizationId: string, teamId: string) {
  return tx
    .select()
    .from(objectives)
    .where(
      and(
        eq(objectives.organizationId, organizationId),
        eq(objectives.teamId, teamId),
        eq(objectives.status, "active"),
      ),
    )
    .orderBy(asc(objectives.createdAt));
}

export async function listActiveByProject(tx: Tx, organizationId: string, projectId: string) {
  return tx
    .select()
    .from(objectives)
    .where(
      and(
        eq(objectives.organizationId, organizationId),
        eq(objectives.projectId, projectId),
        eq(objectives.status, "active"),
      ),
    )
    .orderBy(asc(objectives.createdAt));
}

export async function listActiveByUser(tx: Tx, organizationId: string, userId: string) {
  return tx
    .select()
    .from(objectives)
    .where(
      and(
        eq(objectives.organizationId, organizationId),
        eq(objectives.userId, userId),
        eq(objectives.status, "active"),
      ),
    )
    .orderBy(asc(objectives.createdAt));
}


export async function countActiveByTeam(tx: Tx, organizationId: string, teamId: string): Promise<number> {
  const [row] = await tx
    .select({ count: count() })
    .from(objectives)
    .where(
      and(
        eq(objectives.organizationId, organizationId),
        eq(objectives.teamId, teamId),
        eq(objectives.status, "active"),
      ),
    );
  return Number(row?.count ?? 0);
}

export async function countActiveByUser(tx: Tx, organizationId: string, userId: string): Promise<number> {
  const [row] = await tx
    .select({ count: count() })
    .from(objectives)
    .where(
      and(
        eq(objectives.organizationId, organizationId),
        eq(objectives.userId, userId),
        eq(objectives.status, "active"),
      ),
    );
  return Number(row?.count ?? 0);
}
