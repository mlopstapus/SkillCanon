import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import { deriveInvitationState, type InvitationSummary } from "../domain/invitation";
import { findByOrgAndId } from "../infrastructure/invitations-repo";

type Db = PostgresJsDatabase<Record<string, never>>;

/**
 * Reads one invitation by id, scoped to `organizationId` — a cross-org or
 * nonexistent `invitationId` both return `null` (M3), matching `getObjective`'s
 * existing null-return convention rather than throwing.
 */
export async function getInvitation(
  db: Db,
  organizationId: string,
  invitationId: string,
  now: Date = new Date(),
): Promise<InvitationSummary | null> {
  const row = await findByOrgAndId(db, organizationId, invitationId);
  if (!row) {
    return null;
  }
  return {
    id: row.id,
    email: row.email,
    teamId: row.teamId,
    role: row.role as "admin" | "member",
    state: deriveInvitationState(row, now),
    createdAt: row.createdAt,
  };
}
