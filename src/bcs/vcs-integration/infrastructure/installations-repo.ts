import { and, eq, isNull } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import { installations, webhookDeliveries } from "./schema";

type Db = PostgresJsDatabase<Record<string, never>>;
export type InstallationRow = typeof installations.$inferSelect;

export async function insertInstallation(db: Db, values: typeof installations.$inferInsert): Promise<InstallationRow> {
  const [row] = await db.insert(installations).values(values).returning();
  return row as InstallationRow;
}

export async function findByGithubInstallationId(db: Db, githubInstallationId: number): Promise<InstallationRow | undefined> {
  const [row] = await db.select().from(installations).where(eq(installations.githubInstallationId, githubInstallationId));
  return row;
}

export async function findByOrgAndId(db: Db, organizationId: string, id: string): Promise<InstallationRow | undefined> {
  const [row] = await db
    .select()
    .from(installations)
    .where(and(eq(installations.organizationId, organizationId), eq(installations.id, id)));
  return row;
}

export async function listActiveByOrg(db: Db, organizationId: string): Promise<InstallationRow[]> {
  return db
    .select()
    .from(installations)
    .where(and(eq(installations.organizationId, organizationId), isNull(installations.deletedAt)))
    .orderBy(installations.createdAt);
}

export async function updateInstallation(
  db: Db,
  id: string,
  set: Partial<Pick<InstallationRow, "suspendedAt" | "deletedAt">>,
): Promise<void> {
  await db.update(installations).set(set).where(eq(installations.id, id));
}

/** True the first time a delivery id is seen, false for a redelivery. */
export async function claimDelivery(db: Db, deliveryId: string): Promise<boolean> {
  const rows = await db.insert(webhookDeliveries).values({ deliveryId }).onConflictDoNothing().returning();
  return rows.length === 1;
}
