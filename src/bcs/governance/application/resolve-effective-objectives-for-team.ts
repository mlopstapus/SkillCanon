import { getTeamChain } from "@/bcs/identity-access";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import type { EffectiveObjective, EffectiveObjectiveSet, ObjectiveActor } from "../domain/objective";
import { listActiveByTeam } from "../infrastructure/objectives-repo";

type Db = PostgresJsDatabase<Record<string, never>>;

function asEffectiveObjective(objective: Awaited<ReturnType<typeof listActiveByTeam>>[number], isInherited: boolean): EffectiveObjective {
  return { ...objective, isInherited };
}

/**
 * Same inherited/local split as resolveEffectiveObjectives, but for a bare
 * team scope rather than a specific user — no per-user or per-project
 * branches, since a bare team scope has no associated user or project in
 * this flow. getTeamChain org-scopes teamId itself; a cross-org or
 * nonexistent teamId degrades to empty layers.
 */
export async function resolveEffectiveObjectivesForTeam(
  db: Db,
  actor: ObjectiveActor,
  teamId: string,
): Promise<EffectiveObjectiveSet> {
  let chain: Awaited<ReturnType<typeof getTeamChain>>;
  try {
    chain = await getTeamChain(db, actor.organizationId, teamId);
  } catch {
    return { inherited: [], local: [] };
  }

  const inherited: EffectiveObjective[] = [];
  const local: EffectiveObjective[] = [];

  for (const [index, team] of chain.entries()) {
    const objectives = await listActiveByTeam(db, actor.organizationId, team.id);
    const target = index === 0 ? local : inherited;
    for (const objective of objectives) {
      target.push(asEffectiveObjective(objective, index !== 0));
    }
  }

  return { inherited, local };
}
