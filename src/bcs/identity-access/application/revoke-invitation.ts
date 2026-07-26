import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import {
  DEFAULT_WEB_AUDIT_CONTEXT,
  record,
  type AuditContext,
} from "@/bcs/audit-compliance";
import { withAudit } from "@/shared/db";
import { NotAuthorizedError, type UserSummary } from "../domain/user";
import { deriveInvitationState, InvitationAlreadyAcceptedError, InvitationNotFoundError } from "../domain/invitation";
import { findById as findTeamById } from "../infrastructure/teams-repo";
import { findByOrgAndId, markRevoked } from "../infrastructure/invitations-repo";

type Db = PostgresJsDatabase<Record<string, never>>;

/**
 * Cancels a pending invitation (FR-010). Authorization mirrors `inviteUser`
 * (admin-or-team-owner, research.md §3), checked against the invitation's
 * own `teamId` rather than a caller-supplied one. Revoking an
 * already-accepted invitation is rejected (there is nothing left to
 * revoke); revoking an already-revoked invitation is a no-op.
 */
export async function revokeInvitation(
  db: Db,
  actingUser: UserSummary,
  invitationId: string,
  auditContext: AuditContext = DEFAULT_WEB_AUDIT_CONTEXT,
): Promise<void> {
  const invitation = await findByOrgAndId(db, actingUser.orgId, invitationId);
  if (!invitation) {
    throw new InvitationNotFoundError();
  }

  const team = await findTeamById(db, invitation.teamId);
  if (!team || team.organizationId !== actingUser.orgId) {
    throw new InvitationNotFoundError();
  }
  if (actingUser.role !== "admin" && team.ownerId !== actingUser.id) {
    throw new NotAuthorizedError();
  }

  const state = deriveInvitationState(invitation, new Date());
  if (state === "accepted") {
    throw new InvitationAlreadyAcceptedError();
  }
  if (state === "revoked") {
    return;
  }

  await withAudit(
    db,
    (tx) => markRevoked(tx, invitationId),
    (tx) =>
      record(tx, {
        organizationId: actingUser.orgId,
        actorUserId: actingUser.id,
        actorApiKeyId: null,
        action: "invitation.revoked",
        resourceType: "invitation",
        resourceId: invitationId,
        transport: auditContext.transport,
        sourceIp: auditContext.sourceIp ?? null,
      }),
  );
}
