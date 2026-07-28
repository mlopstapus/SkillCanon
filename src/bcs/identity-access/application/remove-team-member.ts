import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import {
  DEFAULT_WEB_AUDIT_CONTEXT,
  record,
  type AuditContext,
} from "@/bcs/audit-compliance";
import { CrossOrgUserAccessError, NotAuthorizedError, type UserSummary } from "../domain/user";
import { assertCanManageInvitationsForTeam } from "./authorize-invitation-management";
import { findByOrgAndId, update } from "../infrastructure/users-repo";

type Tx = PostgresJsDatabase<Record<string, never>>;

export interface RemoveTeamMemberOptions {
  auditContext?: AuditContext;
}

/**
 * Unassigns `targetUserId` from their current team (`teamId` → `null`) —
 * the account stays active, but is no longer scoped to any team until an
 * admin reassigns it (019-account-team-settings-ui, spec.md FR-013).
 *
 * Authorized the same way as invitation management (org admin, or the
 * target's *current* team's owner) — reuses
 * `assertCanManageInvitationsForTeam` directly rather than re-deriving the
 * rule (research.md §2). An already-unassigned target has no team to
 * authorize against, so only an org admin may act on one (no-op success —
 * matches this bounded context's existing idempotent-terminal-state
 * convention, e.g. `revokeInvitation`).
 */
export async function removeTeamMember(
  tx: Tx,
  actingUser: UserSummary,
  targetUserId: string,
  options: RemoveTeamMemberOptions = {},
): Promise<void> {
  const target = await findByOrgAndId(tx, actingUser.orgId, targetUserId);
  if (!target) {
    throw new CrossOrgUserAccessError();
  }

  if (target.teamId === null) {
    if (actingUser.role !== "admin") {
      throw new NotAuthorizedError();
    }
    return;
  }

  await assertCanManageInvitationsForTeam(tx, actingUser, target.teamId);

  await update(tx, targetUserId, { teamId: null });

  const auditContext = options.auditContext ?? DEFAULT_WEB_AUDIT_CONTEXT;
  await record(tx, {
    organizationId: actingUser.orgId,
    actorUserId: actingUser.id,
    actorApiKeyId: null,
    action: "user.updated",
    resourceType: "user",
    resourceId: targetUserId,
    before: target,
    after: { ...target, teamId: null },
    transport: auditContext.transport,
    sourceIp: auditContext.sourceIp ?? null,
  });
}
