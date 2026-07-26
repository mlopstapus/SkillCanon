import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import type { PolicyActor } from "../domain/policy";
import { listActiveByTeam } from "../infrastructure/policies-repo";

type Db = PostgresJsDatabase<Record<string, never>>;

export async function listTeamPolicies(db: Db, actor: PolicyActor, teamId: string) {
  return listActiveByTeam(db, actor.organizationId, teamId);
}
