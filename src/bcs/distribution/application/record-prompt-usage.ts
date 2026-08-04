import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import type { RecordPromptUsageParams } from "../domain/prompt-usage";
import { insert } from "../infrastructure/prompt-usage-repo";

/**
 * Records one genuine product usage event. No `withAudit` wrap: usage
 * telemetry is explicitly distinct from compliance audit logging.
 */
export async function recordPromptUsage<TSchema extends Record<string, unknown>>(
  db: PostgresJsDatabase<TSchema>,
  params: RecordPromptUsageParams,
): Promise<void> {
  await insert(db, params);
}
