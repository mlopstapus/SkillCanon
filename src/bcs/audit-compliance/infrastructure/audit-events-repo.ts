import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import type { NewAuditEvent } from "../domain/audit-event";
import { auditEvents } from "./schema";

type Tx = PostgresJsDatabase<Record<string, never>>;

export async function insert(tx: Tx, event: NewAuditEvent) {
  const [row] = await tx
    .insert(auditEvents)
    .values({
      organizationId: event.organizationId,
      actorUserId: event.actorUserId,
      actorApiKeyId: event.actorApiKeyId,
      action: event.action,
      resourceType: event.resourceType,
      resourceId: event.resourceId,
      before: event.before ?? null,
      after: event.after ?? null,
      transport: event.transport,
      sourceIp: event.sourceIp ?? null,
    })
    .returning();
  if (!row) {
    throw new Error("Audit event insert returned no row.");
  }
  return row;
}
