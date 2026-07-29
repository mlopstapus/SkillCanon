import { resolveEntitlements } from "@/bcs/billing-entitlements";
import type { AuditEntitlements } from "../domain/audit-event";

/**
 * Real, org-scoped entitlement resolution for the audit trail — replaces
 * the domain layer's old same-BC-only `resolveAuditEntitlements()` stub
 * (removed; see `/speckit-analyze` finding C1, 020-audit-log-ui). Billing &
 * Entitlements' own `CONTRACT.md` already lists "Audit & Compliance" as an
 * intended consumer of `resolveEntitlements` — this wiring was simply never
 * done until now. `canExportAuditEvents` stays hardcoded `false`: no
 * export-specific key exists yet in `EntitlementSnapshot`.
 */
export async function resolveAuditEntitlementsForOrg(organizationId: string): Promise<AuditEntitlements> {
  const snapshot = await resolveEntitlements(organizationId);
  return {
    auditRetentionDays: snapshot.auditRetentionDays,
    canExportAuditEvents: false,
  };
}
