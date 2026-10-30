import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import { DEFAULT_WEB_AUDIT_CONTEXT, record, type AuditContext } from "@/bcs/audit-compliance";
import { NotAuthorizedError, type UserSummary } from "@/bcs/identity-access";
import { withAudit } from "@/shared/db";
import { isEvalsEnabled, upsertEvalsEnabled } from "../infrastructure/eval-runs-repo";

type Db = PostgresJsDatabase<Record<string, never>>;

export async function getEvalsEnabled(db: Db, organizationId: string): Promise<boolean> {
  return isEvalsEnabled(db, organizationId);
}

/**
 * Org-admin opt-in/out of central evals (PDR-020). Opting in is also consent
 * to sending skill content and eval cases to the configured providers.
 */
export async function setEvalsEnabled(
  db: Db,
  actingUser: UserSummary,
  enabled: boolean,
  auditContext: AuditContext = DEFAULT_WEB_AUDIT_CONTEXT,
) {
  if (actingUser.role !== "admin") throw new NotAuthorizedError();
  await withAudit(
    db,
    (tx) => upsertEvalsEnabled(tx, actingUser.orgId, enabled, actingUser.id),
    (tx) =>
      record(tx, {
        organizationId: actingUser.orgId,
        actorUserId: actingUser.id,
        actorApiKeyId: null,
        action: enabled ? "eval_settings.enabled" : "eval_settings.disabled",
        resourceType: "eval_settings",
        resourceId: actingUser.orgId,
        before: null,
        after: { enabled },
        transport: auditContext.transport,
        sourceIp: auditContext.sourceIp ?? null,
      }),
  );
  return { enabled };
}
