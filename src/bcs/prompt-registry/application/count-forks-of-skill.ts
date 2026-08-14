import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import { countForksOfSkill as countForksOfSkillRepo } from "../infrastructure/prompts-repo";

type Db = PostgresJsDatabase<Record<string, never>>;

/**
 * Count of skills within the organization forked from `sourceSkillId` — a
 * pure, unauthenticated read powering the Share drawer's "X teams · Y
 * subscribers · Z copies" summary (038-skill-share-consolidation).
 */
export async function countForksOfSkill(db: Db, organizationId: string, sourceSkillId: string): Promise<number> {
  return countForksOfSkillRepo(db, organizationId, sourceSkillId);
}
