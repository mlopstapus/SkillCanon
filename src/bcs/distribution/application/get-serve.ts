import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import type { Serve } from "../domain/prompt-usage";
import { findById } from "../infrastructure/prompt-usage-repo";

/** Reads one recorded serve, scoped to the organization; cross-org and unknown ids both return `null`. */
export async function getServe<TSchema extends Record<string, unknown>>(
  db: PostgresJsDatabase<TSchema>,
  organizationId: string,
  serveId: string,
): Promise<Serve | null> {
  return findById(db, organizationId, serveId);
}
