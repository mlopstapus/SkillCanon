import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import type { ObjectiveActor } from "../domain/objective";
import { listActiveByUser } from "../infrastructure/objectives-repo";

type Db = PostgresJsDatabase<Record<string, never>>;

export async function listUserObjectives(db: Db, actor: ObjectiveActor, userId: string) {
  return listActiveByUser(db, actor.organizationId, userId);
}
