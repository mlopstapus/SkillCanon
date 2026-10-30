import { randomUUID } from "node:crypto";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import {
  DEFAULT_WEB_AUDIT_CONTEXT,
  record,
  type AuditContext,
} from "@/bcs/audit-compliance";
import type { UserSummary } from "@/bcs/identity-access";
import { withAudit } from "@/shared/db";
import { isUniqueViolation } from "@/shared/db/postgres-errors";
import {
  CannotSubscribeToOwnSkillError,
  DuplicateSubscriptionError,
  SourceSkillNotFoundError,
  type SubscribeSkillParams,
} from "../domain/subscription";
import {
  findByProjectAndSkill,
  insert as insertAssignment,
} from "../infrastructure/project-skill-assignments-repo";
import { findPromptByOrgAndId } from "../infrastructure/prompts-repo";
import {
  findBySourceAndSubscriber,
  insertSubscription,
} from "../infrastructure/subscriptions-repo";
import { assertAuthorizedForOwner } from "./authorize-owner-action";

type Db = PostgresJsDatabase<Record<string, never>>;

/**
 * Creates a live-reference subscription: the subscriber (a user, team, or project)
 * always resolves the source skill's *current* active version at read time
 * — no cached/denormalized copy of the version pointer (FR-008).
 */
export async function subscribeSkill(
  db: Db,
  actingUser: UserSummary,
  sourceSkillId: string,
  params: SubscribeSkillParams,
  auditContext: AuditContext = DEFAULT_WEB_AUDIT_CONTEXT,
) {
  const source = await findPromptByOrgAndId(db, actingUser.orgId, sourceSkillId);
  if (!source) {
    throw new SourceSkillNotFoundError();
  }

  if (source.ownerType === params.subscriberType && source.ownerId === params.subscriberId) {
    throw new CannotSubscribeToOwnSkillError();
  }

  await assertAuthorizedForOwner(db, actingUser, params.subscriberType, params.subscriberId);

  const existing = await findBySourceAndSubscriber(
    db,
    sourceSkillId,
    params.subscriberType,
    params.subscriberId,
  );
  if (existing) {
    throw new DuplicateSubscriptionError();
  }

  const id = randomUUID();
  const values = {
    id,
    organizationId: actingUser.orgId,
    sourceSkillId,
    subscriberType: params.subscriberType,
    subscriberId: params.subscriberId,
  };

  try {
    return await withAudit(
      db,
      async (tx) => {
        const row = await insertSubscription(tx, values);
        // 015/006: a project grant is also an optional assignment, so the
        // project page and the CLI see one model. Never downgrades "required".
        if (
          params.subscriberType === "project" &&
          !(await findByProjectAndSkill(tx, params.subscriberId, sourceSkillId))
        ) {
          await insertAssignment(tx, {
            id: randomUUID(),
            organizationId: actingUser.orgId,
            projectId: params.subscriberId,
            skillId: sourceSkillId,
            requirement: "optional",
          });
        }
        return row;
      },
      (tx) =>
        record(tx, {
          organizationId: actingUser.orgId,
          actorUserId: actingUser.id,
          actorApiKeyId: null,
          action: "skill.subscribed",
          resourceType: "subscription",
          resourceId: id,
          before: null,
          after: values,
          transport: auditContext.transport,
          sourceIp: auditContext.sourceIp ?? null,
        }),
    );
  } catch (err) {
    if (isUniqueViolation(err)) {
      throw new DuplicateSubscriptionError();
    }
    throw err;
  }
}
