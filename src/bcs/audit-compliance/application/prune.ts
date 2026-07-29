import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import { retentionCutoff } from "../domain/audit-event";
import { record } from "./record";
import { deleteOlderThan } from "../infrastructure/audit-events-repo";
import { resolveAuditEntitlementsForOrg } from "./resolve-audit-entitlements-for-org";

type Db = PostgresJsDatabase<Record<string, never>>;

export async function pruneAuditEvents(
  db: Db,
  organizationId: string,
  options?: { now?: Date },
): Promise<{ deleted: number; retentionDays: number }> {
  const entitlements = await resolveAuditEntitlementsForOrg(organizationId);
  const cutoff = retentionCutoff(options?.now ?? new Date(), entitlements.auditRetentionDays);

  const deleted = await db.transaction(async (tx) => {
    const deletedCount = await deleteOlderThan(tx, organizationId, cutoff);
    await record(tx, {
      organizationId,
      actorUserId: null,
      actorApiKeyId: null,
      action: "audit.pruned",
      resourceType: "audit_event",
      resourceId: null,
      before: null,
      after: { deleted: deletedCount },
      transport: "system",
      sourceIp: null,
    });
    return deletedCount;
  });

  return { deleted, retentionDays: entitlements.auditRetentionDays };
}
