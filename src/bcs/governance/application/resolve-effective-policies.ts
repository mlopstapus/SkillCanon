import { getTeamChain, getUser } from "@/bcs/identity-access";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import type { EffectivePolicy, EffectivePolicySet, PolicyActor } from "../domain/policy";
import { listActiveByProject, listActiveByTeam } from "../infrastructure/policies-repo";

type Db = PostgresJsDatabase<Record<string, never>>;

function asEffectivePolicy(policy: Awaited<ReturnType<typeof listActiveByTeam>>[number], isInherited: boolean): EffectivePolicy {
  return { ...policy, isInherited };
}

export async function resolveEffectivePolicies(
  db: Db,
  actor: PolicyActor,
  userId: string,
  projectId?: string | null,
): Promise<EffectivePolicySet> {
  let user: Awaited<ReturnType<typeof getUser>>;
  try {
    user = await getUser(db, userId, actor.organizationId);
  } catch {
    return { inherited: [], local: [] };
  }

  const chain = await getTeamChain(db, actor.organizationId, user.teamId);
  const inherited: EffectivePolicy[] = [];
  const local: EffectivePolicy[] = [];

  for (const [index, team] of chain.entries()) {
    const policies = await listActiveByTeam(db, actor.organizationId, team.id);
    const target = index === 0 ? local : inherited;
    for (const policy of policies) {
      target.push(asEffectivePolicy(policy, index !== 0));
    }
  }

  if (projectId) {
    const projectPolicies = await listActiveByProject(db, actor.organizationId, projectId);
    for (const policy of projectPolicies) {
      local.push(asEffectivePolicy(policy, false));
    }
  }

  inherited.sort((a, b) => b.priority - a.priority);
  local.sort((a, b) => b.priority - a.priority);

  return { inherited, local };
}
