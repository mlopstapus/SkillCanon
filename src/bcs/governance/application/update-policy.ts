import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import {
  DEFAULT_WEB_AUDIT_CONTEXT,
  record,
  type AuditContext,
} from "@/bcs/audit-compliance";
import { withAudit } from "@/shared/db";
import { PolicyNotFoundError, type PolicyActor, type UpdatePolicyFields } from "../domain/policy";
import { findByOrgAndId, update } from "../infrastructure/policies-repo";

type Db = PostgresJsDatabase<Record<string, never>>;

export async function updatePolicy(
  db: Db,
  actor: PolicyActor,
  policyId: string,
  fields: UpdatePolicyFields,
  auditContext: AuditContext = DEFAULT_WEB_AUDIT_CONTEXT,
) {
  let before: Awaited<ReturnType<typeof findByOrgAndId>>;
  let after: Awaited<ReturnType<typeof update>>;

  const result = await withAudit(
    db,
    async (tx) => {
      before = await findByOrgAndId(tx, actor.organizationId, policyId);
      if (!before) {
        throw new PolicyNotFoundError(policyId);
      }
      after = await update(tx, actor.organizationId, policyId, fields);
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
        action: "policy.updated",
        resourceType: "policy",
        resourceId: policyId,
        before,
        after,
        transport: auditContext.transport,
        sourceIp: auditContext.sourceIp ?? null,
      }),
  );

  return result;
}
