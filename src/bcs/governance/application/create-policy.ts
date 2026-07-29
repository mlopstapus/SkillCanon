import { randomUUID } from "node:crypto";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import {
  DEFAULT_WEB_AUDIT_CONTEXT,
  record,
  type AuditContext,
} from "@/bcs/audit-compliance";
import { withAudit } from "@/shared/db";
import {
  InvalidPolicyScopeError,
  PolicyScopeNotFoundError,
  type CreatePolicyParams,
  type PolicyActor,
  type PolicyScopeVerifier,
} from "../domain/policy";
import { insert } from "../infrastructure/policies-repo";

type Db = PostgresJsDatabase<Record<string, never>>;

async function assertTeamBelongsToOrganization(
  actor: PolicyActor,
  params: CreatePolicyParams,
  scopeVerifier: PolicyScopeVerifier,
): Promise<void> {
  if (!params.teamId) {
    throw new InvalidPolicyScopeError();
  }

  const belongs = await scopeVerifier.teamBelongsToOrganization?.(
    actor.organizationId,
    params.teamId,
  );
  if (!belongs) {
    throw new PolicyScopeNotFoundError();
  }
}

export async function createPolicy(
  db: Db,
  actor: PolicyActor,
  params: CreatePolicyParams,
  scopeVerifier: PolicyScopeVerifier,
  auditContext: AuditContext = DEFAULT_WEB_AUDIT_CONTEXT,
) {
  await assertTeamBelongsToOrganization(actor, params, scopeVerifier);
  const id = randomUUID();
  const after = {
    id,
    organizationId: actor.organizationId,
    teamId: params.teamId,
    name: params.name,
    description: params.description ?? null,
    enforcementType: params.enforcementType,
    content: params.content,
    priority: params.priority ?? 0,
    isActive: true,
  };

  return withAudit(
    db,
    (tx) => insert(tx, after),
    (tx) =>
      record(tx, {
        organizationId: actor.organizationId,
        actorUserId: actor.userId,
        actorApiKeyId: null,
        action: "policy.created",
        resourceType: "policy",
        resourceId: id,
        before: null,
        after,
        transport: auditContext.transport,
        sourceIp: auditContext.sourceIp ?? null,
      }),
  );
}
