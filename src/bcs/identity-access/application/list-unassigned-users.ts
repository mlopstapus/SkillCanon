import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import { NotAuthorizedError, type UserAccountSummary, type UserSummary } from "../domain/user";
import { listUnassigned } from "../infrastructure/users-repo";

type Tx = PostgresJsDatabase<Record<string, never>>;

/**
 * Lists every user in `actingUser.orgId` currently unassigned from a team —
 * admin-only, since reassigning them is also admin-only (FR-014,
 * 019-account-team-settings-ui).
 */
export async function listUnassignedUsers(
  tx: Tx,
  actingUser: UserSummary,
): Promise<UserAccountSummary[]> {
  if (actingUser.role !== "admin") {
    throw new NotAuthorizedError();
  }

  const rows = await listUnassigned(tx, actingUser.orgId);
  return rows.map((row) => ({
    id: row.id,
    organizationId: row.organizationId,
    teamId: row.teamId,
    username: row.username,
    displayName: row.displayName,
    email: row.email,
    role: row.role as "admin" | "member",
    isActive: row.isActive,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  }));
}
