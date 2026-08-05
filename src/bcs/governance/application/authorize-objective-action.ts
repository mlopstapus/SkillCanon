import { getTeam, getUser } from "@/bcs/identity-access";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import { ObjectiveNotAuthorizedError, type ObjectiveActor } from "../domain/objective";

type Db = PostgresJsDatabase<Record<string, never>>;

export interface ObjectiveScope {
  teamId: string | null;
  projectId: string | null;
  userId: string | null;
}

/**
 * Objectives have no authorization check today, same gap found on the
 * policy write path (see authorize-policy-action.ts) — closed here rather
 * than shipping a UI on top of it (031-governance-views-ui).
 *
 * Team-scoped: org-admin-or-team-owner, same rule as policies. User-scoped:
 * only that exact user may manage their own objective — matches
 * prompt-registry's assertAuthorizedForOwner "user" branch precedent, no
 * admin override, since this is a personal goal, not a team-administered
 * rule. Project-scoped: org-admin only — no feature creates a
 * project-scoped objective yet (spec.md Assumptions), so this is a
 * conservative default rather than a fully-designed rule; revisit once a
 * real project-objective feature exists rather than adding a new
 * cross-BC dependency on prompt-registry's project ownership here.
 */
export async function assertCanManageObjective(
  db: Db,
  actor: ObjectiveActor,
  scope: ObjectiveScope,
): Promise<void> {
  if (scope.userId !== null) {
    if (scope.userId !== actor.userId) {
      throw new ObjectiveNotAuthorizedError();
    }
    return;
  }

  if (scope.teamId !== null) {
    const [user, team] = await Promise.all([
      getUser(db, actor.userId, actor.organizationId),
      getTeam(db, actor.organizationId, scope.teamId),
    ]);
    if (user.role !== "admin" && team.ownerId !== actor.userId) {
      throw new ObjectiveNotAuthorizedError();
    }
    return;
  }

  // Project-scoped (or unscoped, which should not occur given
  // CreateObjectiveParams requires at least one of team/project/user).
  const user = await getUser(db, actor.userId, actor.organizationId);
  if (user.role !== "admin") {
    throw new ObjectiveNotAuthorizedError();
  }
}
