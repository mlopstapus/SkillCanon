import { and, eq, isNull } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import { teams } from "./schema";

type Tx = PostgresJsDatabase<Record<string, never>>;

export interface InsertTeamParams {
  organizationId: string;
  name: string;
  slug: string;
  description?: string;
  ownerId?: string;
  parentTeamId?: string;
}

export interface UpdateTeamFields {
  name?: string;
  description?: string;
  ownerId?: string;
}

export async function findById(tx: Tx, id: string) {
  const [row] = await tx.select().from(teams).where(eq(teams.id, id));
  return row;
}

/** `undefined` if the id exists but belongs to a different organization — used for cross-org checks (M3). */
export async function findByOrgAndId(tx: Tx, organizationId: string, id: string) {
  const [row] = await tx
    .select()
    .from(teams)
    .where(and(eq(teams.id, id), eq(teams.organizationId, organizationId)));
  return row;
}

/** Every team in `organizationId`, flat (019-account-team-settings-ui — the full hierarchy view needs the whole tree, not one level at a time). */
export async function findAllByOrg(tx: Tx, organizationId: string) {
  return tx.select().from(teams).where(eq(teams.organizationId, organizationId));
}

/** `null` parentTeamId lists an organization's root-level teams. */
export async function findByParent(
  tx: Tx,
  organizationId: string,
  parentTeamId: string | null,
) {
  return tx
    .select()
    .from(teams)
    .where(
      and(
        eq(teams.organizationId, organizationId),
        parentTeamId === null
          ? isNull(teams.parentTeamId)
          : eq(teams.parentTeamId, parentTeamId),
      ),
    );
}

export async function insert(
  tx: Tx,
  params: InsertTeamParams,
): Promise<{ id: string }> {
  const [row] = await tx
    .insert(teams)
    .values({
      organizationId: params.organizationId,
      name: params.name,
      slug: params.slug,
      description: params.description,
      ownerId: params.ownerId,
      parentTeamId: params.parentTeamId,
    })
    .returning({ id: teams.id });
  if (!row) {
    throw new Error("Team insert returned no row.");
  }
  return row;
}

export async function update(
  tx: Tx,
  id: string,
  fields: UpdateTeamFields,
): Promise<void> {
  await tx.update(teams).set(fields).where(eq(teams.id, id));
}

export async function updateParent(
  tx: Tx,
  id: string,
  parentTeamId: string | null,
): Promise<void> {
  await tx.update(teams).set({ parentTeamId }).where(eq(teams.id, id));
}
