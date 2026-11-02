import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import type { UserAccountSummary, UserSummary } from "../domain/user";
import { listByOrgAndTeam } from "../infrastructure/users-repo";

/**
 * Lists users scoped to `actingUser.orgId` only (never a caller-supplied
 * organization, FR-006) — optionally filtered to a team. No role
 * restriction: any authenticated user may list their own organization's
 * roster (spec.md's FR-006 does not restrict this to admins).
 */
export async function listUsers(
  db: PostgresJsDatabase<Record<string, never>>,
  actingUser: UserSummary,
  filters?: { teamId?: string },
): Promise<UserAccountSummary[]> {
  const rows = await listByOrgAndTeam(db, actingUser.orgId, filters?.teamId);
  return rows.map((row) => ({
    id: row.id,
    organizationId: row.organizationId,
    teamId: row.teamId,
    username: row.username,
    displayName: row.displayName,
    email: row.email,
    role: row.role as "admin" | "member",
    isActive: row.isActive,
    managerId: row.managerId,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  }));
}
