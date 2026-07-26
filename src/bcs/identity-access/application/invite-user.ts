import { randomBytes, randomUUID } from "node:crypto";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import {
  DEFAULT_WEB_AUDIT_CONTEXT,
  record,
  type AuditContext,
} from "@/bcs/audit-compliance";
import { withAudit } from "@/shared/db";
import { sendEmail } from "@/shared/email";
import { getAppBaseUrl, getInvitationExpiryHours } from "@/shared/config";
import { logger } from "@/shared/logging";
import { DuplicateUserError, type UserSummary } from "../domain/user";
import { DuplicateInvitationError } from "../domain/invitation";
import { findByEmail as findActiveUsersByEmail } from "../infrastructure/users-repo";
import {
  findActivePendingByEmail,
  insert as insertInvitation,
} from "../infrastructure/invitations-repo";
import { assertCanManageInvitationsForTeam } from "./authorize-invitation-management";

type Db = PostgresJsDatabase<Record<string, never>>;

export interface InviteUserParams {
  teamId: string;
  email: string;
  role?: "admin" | "member";
}

function generateToken(): string {
  return randomBytes(32).toString("base64url");
}

/**
 * Invites an email to join `actingUser.orgId` on a specific team/role
 * (FR-001). Authorization, duplicate checks, and token/expiry generation all
 * happen before the row is written; email delivery is attempted only after
 * the mutation+audit transaction commits, and is best-effort — a delivery
 * failure never rolls back or fails the invitation (FR-005, research.md §4).
 */
export async function inviteUser(
  db: Db,
  actingUser: UserSummary,
  params: InviteUserParams,
  auditContext: AuditContext = DEFAULT_WEB_AUDIT_CONTEXT,
): Promise<{ id: string; token: string }> {
  const team = await assertCanManageInvitationsForTeam(db, actingUser, params.teamId);
  const email = params.email.toLowerCase();

  const activePending = await findActivePendingByEmail(db, actingUser.orgId, email);
  if (activePending.length > 0) {
    throw new DuplicateInvitationError();
  }
  const activeUsers = await findActiveUsersByEmail(db, email);
  if (activeUsers.some((u) => u.organizationId === actingUser.orgId && u.isActive)) {
    throw new DuplicateUserError("email");
  }

  const token = generateToken();
  const expiresAt = new Date(Date.now() + getInvitationExpiryHours() * 60 * 60 * 1000);
  // Generated client-side so the audit event (below) can reference the row's
  // id within the same transaction, without withAudit needing to thread the
  // mutation's return value into the audit-write closure.
  const invitationId = randomUUID();

  const { id } = await withAudit(
    db,
    (tx) =>
      insertInvitation(tx, {
        id: invitationId,
        organizationId: actingUser.orgId,
        teamId: team.id,
        email,
        role: params.role ?? "member",
        token,
        invitedById: actingUser.id,
        expiresAt,
      }),
    (tx) =>
      record(tx, {
        organizationId: actingUser.orgId,
        actorUserId: actingUser.id,
        actorApiKeyId: null,
        action: "invitation.created",
        resourceType: "invitation",
        resourceId: invitationId,
        transport: auditContext.transport,
        sourceIp: auditContext.sourceIp ?? null,
      }),
  );

  try {
    const link = `${getAppBaseUrl()}/invite/${token}`;
    await sendEmail({
      to: email,
      subject: "You've been invited to join an organization on SkillCanon",
      text: `You've been invited to join an organization on SkillCanon. Accept your invitation: ${link}`,
    });
  } catch (err) {
    logger.warn({ err, invitationId: id }, "Invitation email delivery failed");
  }

  return { id, token };
}
