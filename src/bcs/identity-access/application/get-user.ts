import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import { CrossOrgUserAccessError, type UserSummary } from "../domain/user";
import { findById, findByOrgAndId } from "../infrastructure/users-repo";

/**
 * Reads one user by id, returning the `UserSummary` shape only (never
 * `username`, `display_name`, `is_active`, `password_hash`, or timestamps —
 * bcs/identity-access/CONTRACT.md). Completes an API `CONTRACT.md` already
 * promised before this feature existed to implement it.
 *
 * `organizationId` is optional (011-tenant-isolation-rls): when given, the
 * lookup is scoped via `findByOrgAndId` and a cross-org `userId` throws the
 * same as a nonexistent one (M1). When omitted, falls back to the unscoped
 * lookup below — reserved for callers with no organization to scope by yet
 * (`authenticateSession`'s pre-auth resolution, and `logout`, which only
 * ever receives a bare `userId`) — both must be called with the
 * `skillcanon_auth`-connected client. Any other caller should pass its own
 * already-established `organizationId`.
 */
export async function getUser(
  db: PostgresJsDatabase<Record<string, never>>,
  userId: string,
  organizationId?: string,
): Promise<UserSummary> {
  const row =
    organizationId === undefined
      ? await findById(db, userId)
      : await findByOrgAndId(db, organizationId, userId);
  if (!row) {
    if (organizationId !== undefined) {
      throw new CrossOrgUserAccessError();
    }
    throw new Error(`No user found with id "${userId}".`);
  }
  return {
    id: row.id,
    orgId: row.organizationId,
    teamId: row.teamId,
    role: row.role as "admin" | "member",
    email: row.email,
  };
}
