import { randomUUID } from "node:crypto";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import {
  DEFAULT_WEB_AUDIT_CONTEXT,
  record,
  type AuditContext,
} from "@/bcs/audit-compliance";
import { withAudit } from "@/shared/db";
import type { CreateObjectiveParams, ObjectiveActor, ObjectiveScopeVerifier } from "../domain/objective";
import { insert } from "../infrastructure/objectives-repo";
import { assertObjectiveScopesBelongToOrganization, assertParentObjectiveCanBeUsed } from "./objective-validation";
import { assertCanManageObjective } from "./authorize-objective-action";

type Db = PostgresJsDatabase<Record<string, never>>;

export async function createObjective(
  db: Db,
  actor: ObjectiveActor,
  params: CreateObjectiveParams,
  scopeVerifier: ObjectiveScopeVerifier,
  auditContext: AuditContext = DEFAULT_WEB_AUDIT_CONTEXT,
) {
  await assertObjectiveScopesBelongToOrganization(actor.organizationId, params, scopeVerifier);
  await assertCanManageObjective(db, actor, {
    teamId: params.teamId ?? null,
    projectId: params.projectId ?? null,
    userId: params.userId ?? null,
  });
  const id = params.id ?? randomUUID();
  const after = {
    id,
    organizationId: actor.organizationId,
    teamId: params.teamId ?? null,
    projectId: params.projectId ?? null,
    userId: params.userId ?? null,
    title: params.title,
    description: params.description ?? null,
    parentObjectiveId: params.parentObjectiveId ?? null,
    isInherited: false,
    status: params.status ?? "active",
  };

  return withAudit(
    db,
    async (tx) => {
      await assertParentObjectiveCanBeUsed(tx, actor.organizationId, id, after.parentObjectiveId);
      return insert(tx, after);
    },
    (tx) =>
      record(tx, {
        organizationId: actor.organizationId,
        actorUserId: actor.userId,
        actorApiKeyId: null,
        action: "objective.created",
        resourceType: "objective",
        resourceId: id,
        before: null,
        after,
        transport: auditContext.transport,
        sourceIp: auditContext.sourceIp ?? null,
      }),
  );
}
