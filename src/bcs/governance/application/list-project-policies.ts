import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import type { PolicyActor } from "../domain/policy";
import { listActiveByProject } from "../infrastructure/policies-repo";

type Db = PostgresJsDatabase<Record<string, never>>;

export async function listProjectPolicies(db: Db, actor: PolicyActor, projectId: string) {
  return listActiveByProject(db, actor.organizationId, projectId);
}
