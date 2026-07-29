import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import { listDistinctResourceTypes } from "../infrastructure/audit-events-repo";

type Db = PostgresJsDatabase<Record<string, never>>;

/**
 * Powers the Audit Log page's Resource filter dropdown with the org's real,
 * currently-retained resource types — never a hardcoded list.
 */
export async function listAuditResourceTypeOptions(
  db: Db,
  organizationId: string,
  retentionCutoff: Date,
): Promise<string[]> {
  return listDistinctResourceTypes(db, organizationId, retentionCutoff);
}
