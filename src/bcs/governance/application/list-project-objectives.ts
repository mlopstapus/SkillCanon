import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import type { ObjectiveActor } from "../domain/objective";
import { listActiveByProject } from "../infrastructure/objectives-repo";

type Db = PostgresJsDatabase<Record<string, never>>;

export async function listProjectObjectives(db: Db, actor: ObjectiveActor, projectId: string) {
  return listActiveByProject(db, actor.organizationId, projectId);
}
