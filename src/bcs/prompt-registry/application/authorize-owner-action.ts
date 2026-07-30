import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import { getTeam, type UserSummary } from "@/bcs/identity-access";
import {
  CrossOrgSubscriberError,
  SubscriberNotAuthorizedError,
  type OwnerType,
} from "../domain/subscription";

type Tx = PostgresJsDatabase<Record<string, never>>;

/**
 * Shared authorization for any operation that acts "as" a user or a team —
 * subscribeSkill/forkSkill's subscriber/new-owner, and unsubscribeSkill's
 * existing subscriber (research.md's authorization decision).
 *
 * For `ownerType: "user"`, only that exact user may act as themselves —
 * there is no "subscribe/fork on behalf of another user" path, so this also
 * transitively satisfies the subscriber's own organization membership (an
 * `actingUser` is always already resolved within their own organization).
 *
 * For `ownerType: "team"`, the acting user must be an org admin or that
 * team's own `owner_id` — the exact same org-admin-or-team-owner rule
 * identity-access's `assertCanManageInvitationsForTeam` already enforces
 * internally (not exported from its barrel) — re-derived here using
 * identity-access's exported `getTeam`, never its internals (tenet D1).
 * `getTeam` is itself organization-scoped, so a team id that resolves in a
 * different organization (or doesn't exist at all) is indistinguishable
 * from an unauthorized team — both surface as `CrossOrgSubscriberError`.
 */
export async function assertAuthorizedForOwner(
  tx: Tx,
  actingUser: UserSummary,
  ownerType: OwnerType,
  ownerId: string,
): Promise<void> {
  if (ownerType === "user") {
    if (ownerId !== actingUser.id) {
      throw new SubscriberNotAuthorizedError();
    }
    return;
  }

  let team;
  try {
    team = await getTeam(tx, actingUser.orgId, ownerId);
  } catch {
    throw new CrossOrgSubscriberError();
  }

  if (actingUser.role !== "admin" && team.ownerId !== actingUser.id) {
    throw new SubscriberNotAuthorizedError();
  }
}
