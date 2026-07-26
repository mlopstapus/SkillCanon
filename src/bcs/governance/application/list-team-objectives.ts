import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import type { ObjectiveActor } from "../domain/objective";
import { listActiveByTeam } from "../infrastructure/objectives-repo";

type Db = PostgresJsDatabase<Record<string, never>>;

export async function listTeamObjectives(db: Db, actor: ObjectiveActor, teamId: string) {
  return listActiveByTeam(db, actor.organizationId, teamId);
}
