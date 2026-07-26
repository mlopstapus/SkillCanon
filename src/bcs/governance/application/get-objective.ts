import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import type { ObjectiveActor } from "../domain/objective";
import { findByOrgAndId } from "../infrastructure/objectives-repo";

type Db = PostgresJsDatabase<Record<string, never>>;

export async function getObjective(db: Db, actor: ObjectiveActor, objectiveId: string) {
  return (await findByOrgAndId(db, actor.organizationId, objectiveId)) ?? null;
}
