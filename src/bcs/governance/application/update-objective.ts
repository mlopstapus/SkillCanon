import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import {
  DEFAULT_WEB_AUDIT_CONTEXT,
  record,
  type AuditContext,
} from "@/bcs/audit-compliance";
import { withAudit } from "@/shared/db";
import {
  ObjectiveNotFoundError,
  type ObjectiveActor,
  type ObjectiveScopeVerifier,
  type UpdateObjectiveFields,
} from "../domain/objective";
import { findByOrgAndId, update } from "../infrastructure/objectives-repo";
import { assertObjectiveScopesBelongToOrganization, assertParentObjectiveCanBeUsed } from "./objective-validation";
import { assertCanManageObjective } from "./authorize-objective-action";

type Db = PostgresJsDatabase<Record<string, never>>;

function removeUndefinedFields(fields: UpdateObjectiveFields): UpdateObjectiveFields {
  return Object.fromEntries(Object.entries(fields).filter(([, value]) => value !== undefined));
}

export async function updateObjective(
  db: Db,
  actor: ObjectiveActor,
  objectiveId: string,
  fields: UpdateObjectiveFields,
  scopeVerifier: ObjectiveScopeVerifier,
  auditContext: AuditContext = DEFAULT_WEB_AUDIT_CONTEXT,
) {
  await assertObjectiveScopesBelongToOrganization(actor.organizationId, fields, scopeVerifier);
  const updateFields = removeUndefinedFields(fields);
  let before: Awaited<ReturnType<typeof findByOrgAndId>>;
  let after: Awaited<ReturnType<typeof update>>;

  const result = await withAudit(
    db,
    async (tx) => {
      before = await findByOrgAndId(tx, actor.organizationId, objectiveId);
      if (!before) {
        throw new ObjectiveNotFoundError(objectiveId);
      }
      await assertCanManageObjective(tx, actor, {
        teamId: before.teamId,
        projectId: before.projectId,
        userId: before.userId,
      });
      if (Object.hasOwn(updateFields, "parentObjectiveId")) {
        await assertParentObjectiveCanBeUsed(
          tx,
          actor.organizationId,
          objectiveId,
          updateFields.parentObjectiveId,
        );
      }
      after = await update(tx, actor.organizationId, objectiveId, updateFields);
      if (!after) {
        throw new ObjectiveNotFoundError(objectiveId);
      }
      return after;
    },
    (tx) =>
      record(tx, {
        organizationId: actor.organizationId,
        actorUserId: actor.userId,
        actorApiKeyId: null,
        action: "objective.updated",
        resourceType: "objective",
        resourceId: objectiveId,
        before,
        after,
        transport: auditContext.transport,
        sourceIp: auditContext.sourceIp ?? null,
      }),
  );

  return result;
}
