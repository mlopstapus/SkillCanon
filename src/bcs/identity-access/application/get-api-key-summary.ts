import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import type { ApiKeySummary } from "../domain/api-key";
import { findByOrgAndId } from "../infrastructure/api-keys-repo";

type Db = PostgresJsDatabase<Record<string, never>>;

/**
 * Reads one API key's summary (never the hash or raw value) by id, scoped
 * to `organizationId` — a cross-org or nonexistent `apiKeyId` both return
 * `null` (M3), matching `getObjective`'s existing null-return convention
 * rather than throwing.
 */
export async function getApiKeySummary(
  db: Db,
  organizationId: string,
  apiKeyId: string,
): Promise<ApiKeySummary | null> {
  const row = await findByOrgAndId(db, organizationId, apiKeyId);
  if (!row) {
    return null;
  }
  return {
    id: row.id,
    userId: row.userId,
    name: row.name,
    prefix: row.prefix,
    scopes: row.scopes,
    expiresAt: row.expiresAt,
    isActive: row.isActive,
    lastUsedAt: row.lastUsedAt,
    createdAt: row.createdAt,
  };
}
