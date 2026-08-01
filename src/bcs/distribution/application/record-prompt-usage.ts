import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import type { RecordPromptUsageParams } from "../domain/prompt-usage";
import { insert } from "../infrastructure/prompt-usage-repo";

/**
 * Records one genuine (non-test, non-preview) prompt expansion. No
 * `withAudit` wrap — usage telemetry is explicitly distinct from the audit
 * trail (see CONTRACT.md). Not called by any production code path yet
 * (spec FR-002a) — used directly by tests to seed fixtures.
 */
export async function recordPromptUsage<TSchema extends Record<string, unknown>>(
  db: PostgresJsDatabase<TSchema>,
  params: RecordPromptUsageParams,
): Promise<void> {
  await insert(db, params);
}
