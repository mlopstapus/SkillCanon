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

async function assertScopeBelongsToOrganization(
  actor: PolicyActor,
  params: CreatePolicyParams,
  scopeVerifier: PolicyScopeVerifier,
): Promise<void> {
  const hasTeam = params.teamId != null;
  const hasProject = params.projectId != null;
  if (hasTeam === hasProject) {
    throw new InvalidPolicyScopeError();
  }

  if (params.teamId) {
    const belongs = await scopeVerifier.teamBelongsToOrganization?.(
      actor.organizationId,
      params.teamId,
    );
    if (!belongs) {
      throw new PolicyScopeNotFoundError();
    }
    return;
  }

  if (params.projectId) {
    const belongs = await scopeVerifier.projectBelongsToOrganization?.(
      actor.organizationId,
      params.projectId,
    );
    if (!belongs) {
      throw new PolicyScopeNotFoundError();
    }
  }
}

export async function createPolicy(
  db: Db,
  actor: PolicyActor,
  params: CreatePolicyParams,
  scopeVerifier: PolicyScopeVerifier,
  auditContext: AuditContext = DEFAULT_WEB_AUDIT_CONTEXT,
) {
  await assertScopeBelongsToOrganization(actor, params, scopeVerifier);
  const id = randomUUID();
  const after = {
    id,
    organizationId: actor.organizationId,
    teamId: params.teamId ?? null,
    projectId: params.projectId ?? null,
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
