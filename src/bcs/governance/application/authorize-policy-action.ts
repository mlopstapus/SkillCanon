import { getTeam, getUser } from "@/bcs/identity-access";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import { PolicyNotAuthorizedError, type PolicyActor } from "../domain/policy";

type Db = PostgresJsDatabase<Record<string, never>>;

/**
 * Org-admin-or-team-owner rule, re-derived here rather than imported —
 * `assertAuthorizedForOwner` (prompt-registry) and
 * `assertCanManageInvitationsForTeam` (identity-access, not exported)
 * already enforce the identical rule for their own BCs; governance's write
 * path (createPolicy/updatePolicy/deletePolicy) had no authorization check
 * at all before this feature — found and closed here rather than shipping
 * a UI on top of it (031-governance-views-ui).
 */
export async function assertCanManagePolicyForTeam(
  db: Db,
  actor: PolicyActor,
  teamId: string,
): Promise<void> {
  const [user, team] = await Promise.all([
    getUser(db, actor.userId, actor.organizationId),
    getTeam(db, actor.organizationId, teamId),
  ]);

  if (user.role !== "admin" && team.ownerId !== actor.userId) {
    throw new PolicyNotAuthorizedError();
  }
}
