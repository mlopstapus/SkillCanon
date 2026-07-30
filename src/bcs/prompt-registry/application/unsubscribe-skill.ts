import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import {
  DEFAULT_WEB_AUDIT_CONTEXT,
  record,
  type AuditContext,
} from "@/bcs/audit-compliance";
import type { UserSummary } from "@/bcs/identity-access";
import { withAudit } from "@/shared/db";
import { SubscriptionNotFoundError } from "../domain/subscription";
import { deleteById, findByOrgAndId } from "../infrastructure/subscriptions-repo";
import { assertAuthorizedForOwner } from "./authorize-owner-action";

type Db = PostgresJsDatabase<Record<string, never>>;

/**
 * Removes a subscription — authorized the same way as creating one (the
 * subscriber themselves, or, for a team subscription, an admin/owner of
 * that team). Has no effect on any other subscriber or on the source skill
 * (FR-006). A nonexistent, cross-org, or not-authorized-for subscription id
 * all reject with no side effects (FR-007).
 */
export async function unsubscribeSkill(
  db: Db,
  actingUser: UserSummary,
  subscriptionId: string,
  auditContext: AuditContext = DEFAULT_WEB_AUDIT_CONTEXT,
) {
  const subscription = await findByOrgAndId(db, actingUser.orgId, subscriptionId);
  if (!subscription) {
    throw new SubscriptionNotFoundError();
  }

  await assertAuthorizedForOwner(
    db,
    actingUser,
    subscription.subscriberType,
    subscription.subscriberId,
  );

  return withAudit(
    db,
    (tx) => deleteById(tx, subscriptionId),
    (tx) =>
      record(tx, {
        organizationId: actingUser.orgId,
        actorUserId: actingUser.id,
        actorApiKeyId: null,
        action: "skill.unsubscribed",
        resourceType: "subscription",
        resourceId: subscriptionId,
        before: subscription,
        after: null,
        transport: auditContext.transport,
        sourceIp: auditContext.sourceIp ?? null,
      }),
  );
}
