import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import type { PolicyActor } from "../domain/policy";
import { findByOrgAndId } from "../infrastructure/policies-repo";

type Db = PostgresJsDatabase<Record<string, never>>;

export async function getPolicy(db: Db, actor: PolicyActor, policyId: string) {
  return findByOrgAndId(db, actor.organizationId, policyId);
}
