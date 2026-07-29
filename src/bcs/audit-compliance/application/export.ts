import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import {
  type AuditEvent,
  type AuditExportFormat,
  type AuditExportResult,
  AuditExportEntitlementRequiredError,
  UnsupportedAuditExportFormatError,
  retentionCutoff,
} from "../domain/audit-event";
import { queryByOrganization } from "../infrastructure/audit-events-repo";
import { resolveAuditEntitlementsForOrg } from "./resolve-audit-entitlements-for-org";

type Db = PostgresJsDatabase<Record<string, never>>;

const CSV_COLUMNS = [
  "id",
  "organizationId",
  "actorUserId",
  "actorApiKeyId",
  "action",
  "resourceType",
  "resourceId",
  "before",
  "after",
  "transport",
  "sourceIp",
  "createdAt",
] as const;

function csvCell(value: unknown): string {
  if (value === null || value === undefined) {
    return "";
  }
  const raw = value instanceof Date ? value.toISOString() : typeof value === "object" ? JSON.stringify(value) : String(value);
  return /[",\n\r]/.test(raw) ? `"${raw.replaceAll('"', '""')}"` : raw;
}

export function formatAuditEventsCsv(events: AuditEvent[]): string {
  const rows = [CSV_COLUMNS.join(",")];
  for (const event of events) {
    rows.push(CSV_COLUMNS.map((column) => csvCell(event[column])).join(","));
  }
  return `${rows.join("\n")}\n`;
}

export async function exportAuditEvents(
  db: Db,
  organizationId: string,
  format: AuditExportFormat,
  options?: { now?: Date },
): Promise<AuditExportResult> {
  if (format !== "csv") {
    throw new UnsupportedAuditExportFormatError(format);
  }

  const entitlements = await resolveAuditEntitlementsForOrg(organizationId);
  if (!entitlements.canExportAuditEvents) {
    throw new AuditExportEntitlementRequiredError();
  }

  const now = options?.now ?? new Date();
  const items = await queryByOrganization(db, organizationId, {
    retentionCutoff: retentionCutoff(now, entitlements.auditRetentionDays),
  });
  return {
    filename: `audit-events-${organizationId}.csv`,
    contentType: "text/csv",
    body: formatAuditEventsCsv(items),
  };
}
