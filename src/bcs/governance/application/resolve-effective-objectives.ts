import { getTeamChain, getUser } from "@/bcs/identity-access";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import type { EffectiveObjective, EffectiveObjectiveSet, ObjectiveActor } from "../domain/objective";
import {
  listActiveByProject,
  listActiveByTeam,
  listActiveByUser,
} from "../infrastructure/objectives-repo";

type Db = PostgresJsDatabase<Record<string, never>>;

type ObjectiveRow = Awaited<ReturnType<typeof listActiveByTeam>>[number];

function asEffectiveObjective(objective: ObjectiveRow, isInherited: boolean): EffectiveObjective {
  return { ...objective, isInherited };
}

export async function resolveEffectiveObjectives(
  db: Db,
  actor: ObjectiveActor,
  userId: string,
  projectId?: string | null,
): Promise<EffectiveObjectiveSet> {
  let user: Awaited<ReturnType<typeof getUser>>;
  try {
    user = await getUser(db, userId, actor.organizationId);
  } catch {
    return { inherited: [], local: [] };
  }

  // An unassigned user (019-account-team-settings-ui) has no team to derive
  // an inheritance chain from — no team-level objectives apply, not an
  // error. Their own directly-assigned objectives (below) still resolve.
  const chain =
    user.teamId === null
      ? []
      : await getTeamChain(db, actor.organizationId, user.teamId);
  const inherited: EffectiveObjective[] = [];
  const local: EffectiveObjective[] = [];

  for (const [index, team] of chain.entries()) {
    const objectives = await listActiveByTeam(db, actor.organizationId, team.id);
    const target = index === 0 ? local : inherited;
    for (const objective of objectives) {
      target.push(asEffectiveObjective(objective, index !== 0));
    }
  }

  const userObjectives = await listActiveByUser(db, actor.organizationId, userId);
  for (const objective of userObjectives) {
    local.push(asEffectiveObjective(objective, false));
  }

  if (projectId) {
    const projectObjectives = await listActiveByProject(db, actor.organizationId, projectId);
    for (const objective of projectObjectives) {
      local.push(asEffectiveObjective(objective, false));
    }
  }

  return { inherited, local };
}
