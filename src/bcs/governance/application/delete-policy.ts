import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import {
  DEFAULT_WEB_AUDIT_CONTEXT,
  record,
  type AuditContext,
} from "@/bcs/audit-compliance";
import { withAudit } from "@/shared/db";
import { PolicyNotFoundError, type PolicyActor } from "../domain/policy";
import { deactivate, findByOrgAndId } from "../infrastructure/policies-repo";

type Db = PostgresJsDatabase<Record<string, never>>;

export async function deletePolicy(
  db: Db,
  actor: PolicyActor,
  policyId: string,
  auditContext: AuditContext = DEFAULT_WEB_AUDIT_CONTEXT,
): Promise<boolean> {
  const current = await findByOrgAndId(db, actor.organizationId, policyId);
  if (!current) {
    throw new PolicyNotFoundError(policyId);
  }
  if (!current.isActive) {
    return false;
  }

  let after: Awaited<ReturnType<typeof deactivate>>;
  await withAudit(
    db,
    async (tx) => {
      after = await deactivate(tx, actor.organizationId, policyId);
      if (!after) {
        throw new PolicyNotFoundError(policyId);
      }
      return after;
    },
    (tx) =>
      record(tx, {
        organizationId: actor.organizationId,
        actorUserId: actor.userId,
        actorApiKeyId: null,
        action: "policy.deactivated",
        resourceType: "policy",
        resourceId: policyId,
        before: current,
        after,
        transport: auditContext.transport,
        sourceIp: auditContext.sourceIp ?? null,
      }),
  );

  return true;
}
