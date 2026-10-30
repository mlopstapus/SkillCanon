import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import { computeDownRate, type DownRate } from "../domain/feedback";
import { ratingCountsByVersionIds } from "../infrastructure/feedback-repo";

/** Down-rate per prompt version id; a version with no rated feedback maps to `rate: null`. */
export async function getDownRates<TSchema extends Record<string, unknown>>(
  db: PostgresJsDatabase<TSchema>,
  organizationId: string,
  versionIds: string[],
): Promise<Map<string, DownRate>> {
  const counts = await ratingCountsByVersionIds(db, organizationId, versionIds);
  return new Map(versionIds.map((id) => [id, computeDownRate(counts.get(id)?.up ?? 0, counts.get(id)?.down ?? 0)]));
}
