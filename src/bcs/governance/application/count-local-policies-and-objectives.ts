import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import type { LocalGovernanceCount, PolicyActor } from "../domain/policy";
import { countActiveByTeam as countActivePoliciesByTeam } from "../infrastructure/policies-repo";
import {
  countActiveByTeam as countActiveObjectivesByTeam,
  countActiveByUser as countActiveObjectivesByUser,
} from "../infrastructure/objectives-repo";

type Db = PostgresJsDatabase<Record<string, never>>;

export type LocalGovernanceNode =
  | { type: "team"; id: string }
  | { type: "user"; id: string };

export async function countLocalPoliciesAndObjectives(
  db: Db,
  actor: Pick<PolicyActor, "organizationId">,
  node: LocalGovernanceNode,
): Promise<LocalGovernanceCount> {
  if (node.type === "user") {
    const objectiveCount = await countActiveObjectivesByUser(db, actor.organizationId, node.id);
    return { policyCount: 0, objectiveCount, total: objectiveCount };
  }

  const [policyCount, objectiveCount] = await Promise.all([
    countActivePoliciesByTeam(db, actor.organizationId, node.id),
    countActiveObjectivesByTeam(db, actor.organizationId, node.id),
  ]);

  return { policyCount, objectiveCount, total: policyCount + objectiveCount };
}
