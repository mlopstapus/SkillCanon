import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import {
  DEFAULT_WEB_AUDIT_CONTEXT,
  record,
  type AuditContext,
} from "@/bcs/audit-compliance";
import { withAudit } from "@/shared/db";
import { ObjectiveNotFoundError, type ObjectiveActor } from "../domain/objective";
import { findByOrgAndId, hardDelete } from "../infrastructure/objectives-repo";

type Db = PostgresJsDatabase<Record<string, never>>;

export async function deleteObjective(
  db: Db,
  actor: ObjectiveActor,
  objectiveId: string,
  auditContext: AuditContext = DEFAULT_WEB_AUDIT_CONTEXT,
): Promise<boolean> {
  let before: Awaited<ReturnType<typeof findByOrgAndId>>;

  await withAudit(
    db,
    async (tx) => {
      before = await findByOrgAndId(tx, actor.organizationId, objectiveId);
      if (!before) {
        throw new ObjectiveNotFoundError(objectiveId);
      }
      const deleted = await hardDelete(tx, actor.organizationId, objectiveId);
      if (!deleted) {
        throw new ObjectiveNotFoundError(objectiveId);
      }
      return deleted;
    },
    (tx) =>
      record(tx, {
        organizationId: actor.organizationId,
        actorUserId: actor.userId,
        actorApiKeyId: null,
        action: "objective.deleted",
        resourceType: "objective",
        resourceId: objectiveId,
        before,
        after: null,
        transport: auditContext.transport,
        sourceIp: auditContext.sourceIp ?? null,
      }),
  );

  return true;
}
