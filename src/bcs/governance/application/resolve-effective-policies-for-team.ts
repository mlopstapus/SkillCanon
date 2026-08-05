import { getTeamChain } from "@/bcs/identity-access";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import type { EffectivePolicy, EffectivePolicySet, PolicyActor } from "../domain/policy";
import { listActiveByTeam } from "../infrastructure/policies-repo";

type Db = PostgresJsDatabase<Record<string, never>>;

function asEffectivePolicy(policy: Awaited<ReturnType<typeof listActiveByTeam>>[number], isInherited: boolean): EffectivePolicy {
  return { ...policy, isInherited };
}

/**
 * Same inherited/local split as resolveEffectivePolicies, but for a bare
 * team scope rather than a specific user's chain — needed because a
 * governance UI scope tree lets an admin select a team node directly, not
 * only a person. getTeamChain org-scopes teamId itself (throws if it
 * doesn't belong to actor.organizationId), so a cross-org or nonexistent
 * teamId degrades to empty layers, matching resolveEffectivePolicies'
 * missing-user behavior.
 */
export async function resolveEffectivePoliciesForTeam(
  db: Db,
  actor: PolicyActor,
  teamId: string,
): Promise<EffectivePolicySet> {
  let chain: Awaited<ReturnType<typeof getTeamChain>>;
  try {
    chain = await getTeamChain(db, actor.organizationId, teamId);
  } catch {
    return { inherited: [], local: [] };
  }

  const inherited: EffectivePolicy[] = [];
  const local: EffectivePolicy[] = [];

  for (const [index, team] of chain.entries()) {
    const policies = await listActiveByTeam(db, actor.organizationId, team.id);
    const target = index === 0 ? local : inherited;
    for (const policy of policies) {
      target.push(asEffectivePolicy(policy, index !== 0));
    }
  }

  inherited.sort((a, b) => b.priority - a.priority);
  local.sort((a, b) => b.priority - a.priority);

  return { inherited, local };
}
