import { and, eq, isNull } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import { teams, users } from "./schema";

type Tx = PostgresJsDatabase<Record<string, never>>;

export interface InsertUserParams {
  /** Optional client-generated id — lets a caller know the row's id before the insert commits, for use in the same transaction's audit event (009-invitations). Omit to let the column default apply. */
  id?: string;
  organizationId: string;
  teamId: string;
  username: string;
  displayName: string;
  email: string;
  passwordHash: string;
  role: "admin" | "member";
}

export interface UpdateUserFields {
  displayName?: string;
  email?: string;
  username?: string;
  role?: "admin" | "member";
  isActive?: boolean;
  /** `null` unassigns the user from every team (019-account-team-settings-ui). */
  teamId?: string | null;
}

export async function insert(
  tx: Tx,
  params: InsertUserParams,
): Promise<{ id: string }> {
  const [row] = await tx
    .insert(users)
    .values({
      ...(params.id ? { id: params.id } : {}),
      organizationId: params.organizationId,
      teamId: params.teamId,
      username: params.username,
      displayName: params.displayName,
      email: params.email,
      passwordHash: params.passwordHash,
      role: params.role,
    })
    .returning({ id: users.id });
  if (!row) {
    throw new Error("User insert returned no row.");
  }
  return row;
}

export async function findById(tx: Tx, id: string) {
  const [row] = await tx.select().from(users).where(eq(users.id, id));
  return row;
}

/**
 * Resolves the live, presentation-safe identity needed by the authenticated
 * app shell in one query. The join includes organization equality explicitly:
 * `users.team_id` has an FK to teams, but that FK alone does not prove the
 * referenced team belongs to the same tenant.
 *
 * `leftJoin` (not `innerJoin`) since 019-account-team-settings-ui: a user can
 * legitimately have `team_id = null` (unassigned) and must still resolve —
 * `teamName` comes back `null` in that case. The join's `and(...)` condition
 * still fails to match (and therefore still yields `teamName: null`) for a
 * `team_id` pointing at a team in a *different* organization — the caller
 * (`authenticateSession`) is responsible for telling these two null-teamName
 * cases apart (`teamId === null` vs. `teamId` set but the join found
 * nothing), since only the latter is the M3 cross-org violation that must
 * still be rejected outright.
 */
export async function findAppSessionUserById(tx: Tx, id: string) {
  const [row] = await tx
    .select({
      id: users.id,
      orgId: users.organizationId,
      teamId: users.teamId,
      role: users.role,
      email: users.email,
      displayName: users.displayName,
      teamName: teams.name,
      isActive: users.isActive,
    })
    .from(users)
    .leftJoin(
      teams,
      and(
        eq(teams.id, users.teamId),
        eq(teams.organizationId, users.organizationId),
      ),
    )
    .where(eq(users.id, id));
  return row;
}

/** Every user in `organizationId` currently unassigned from any team (019-account-team-settings-ui). */
export async function listUnassigned(tx: Tx, organizationId: string) {
  return tx
    .select()
    .from(users)
    .where(
      and(eq(users.organizationId, organizationId), isNull(users.teamId)),
    );
}

/**
 * Returns every user matching `email` (already-lowercased), across *all*
 * organizations, active or not. Login has no organization context yet to
 * scope by — email is only unique per-organization (PDR-003), not globally
 * — so more than one row can come back if two different organizations each
 * have an account with this email (research.md §8). Includes deactivated
 * users deliberately: FR-008 requires `login()` to still *reject* them, but
 * FR-011's audit trail is meant to identify "the matching user, if the
 * email resolves to a real account" even when that account is deactivated
 * — that's a real login-attempt-against-a-real-account, not the same as an
 * unknown email, even though both produce the same public "invalid
 * credentials" response.
 */
export async function findByEmail(tx: Tx, email: string) {
  return tx.select().from(users).where(eq(users.email, email));
}

/** Returns `undefined` if the id exists but belongs to a different organization — used for cross-org checks (M3). */
export async function findByOrgAndId(
  tx: Tx,
  organizationId: string,
  id: string,
) {
  const [row] = await tx
    .select()
    .from(users)
    .where(and(eq(users.id, id), eq(users.organizationId, organizationId)));
  return row;
}

export async function update(
  tx: Tx,
  id: string,
  fields: UpdateUserFields,
): Promise<void> {
  await tx.update(users).set(fields).where(eq(users.id, id));
}

export async function countActiveAdmins(
  tx: Tx,
  organizationId: string,
): Promise<number> {
  const rows = await tx
    .select({ id: users.id })
    .from(users)
    .where(
      and(
        eq(users.organizationId, organizationId),
        eq(users.role, "admin"),
        eq(users.isActive, true),
      ),
    );
  return rows.length;
}

export async function listByOrgAndTeam(
  tx: Tx,
  organizationId: string,
  teamId?: string,
) {
  return tx
    .select()
    .from(users)
    .where(
      teamId === undefined
        ? eq(users.organizationId, organizationId)
        : and(
            eq(users.organizationId, organizationId),
            eq(users.teamId, teamId),
          ),
    );
}
