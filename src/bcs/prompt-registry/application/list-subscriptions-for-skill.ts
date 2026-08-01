import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import { listBySourceSkill } from "../infrastructure/subscriptions-repo";

type Db = PostgresJsDatabase<Record<string, never>>;

/**
 * Every subscription grant on a skill, regardless of subscriber kind — a
 * pure, unauthenticated read powering the Share drawer's "who already has
 * access" state (023-prompt-registry-views-ui).
 */
export async function listSubscriptionsForSkill(db: Db, organizationId: string, sourceSkillId: string) {
  return listBySourceSkill(db, organizationId, sourceSkillId);
}
