import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import { NotAuthorizedError, type UserSummary } from "../domain/user";
import { deriveInvitationState, type InvitationSummary } from "../domain/invitation";
import { listByOrganization } from "../infrastructure/invitations-repo";

type Db = PostgresJsDatabase<Record<string, never>>;

/** Admin-only (FR-011); never includes the raw `token` in the returned shape. */
export async function listInvitations(
  db: Db,
  actingUser: UserSummary,
): Promise<InvitationSummary[]> {
  if (actingUser.role !== "admin") {
    throw new NotAuthorizedError();
  }

  const rows = await listByOrganization(db, actingUser.orgId);
  const now = new Date();
  return rows.map((row) => ({
    id: row.id,
    email: row.email,
    teamId: row.teamId,
    role: row.role as "admin" | "member",
    state: deriveInvitationState(row, now),
    invitedById: row.invitedById,
    expiresAt: row.expiresAt,
    createdAt: row.createdAt,
  }));
}
