import { randomUUID } from "node:crypto";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import {
  DEFAULT_WEB_AUDIT_CONTEXT,
  record,
  type AuditContext,
} from "@/bcs/audit-compliance";
import { withAudit } from "@/shared/db";
import type { UserSummary } from "../domain/user";
import {
  deriveInvitationState,
  InvalidInvitationTokenError,
  InvitationAlreadyAcceptedError,
  InvitationExpiredError,
  InvitationRevokedError,
} from "../domain/invitation";
import { findByToken, markAccepted } from "../infrastructure/invitations-repo";
import { insertValidatedUser } from "./insert-validated-user";

type Db = PostgresJsDatabase<Record<string, never>>;

export interface AcceptInvitationParams {
  username: string;
  password: string;
  displayName?: string;
}

/** Maps a just-lost-the-race invitation's now-current state to the matching thrown error. */
function throwForNonPendingState(state: "accepted" | "expired" | "revoked"): never {
  if (state === "revoked") {
    throw new InvitationRevokedError();
  }
  if (state === "expired") {
    throw new InvitationExpiredError();
  }
  throw new InvitationAlreadyAcceptedError();
}

/**
 * Redeems a pending invitation token into a new active user (FR-006).
 * The resulting account's organization/team/role come *only* from the
 * invitation's own row — never from any parameter here — making
 * cross-organization redemption structurally impossible (FR-007). The
 * accept is concurrency-safe (research.md §6): `markAccepted`'s conditional
 * update ensures only one of two simultaneous callers on the same token can
 * proceed to create an account.
 */
export async function acceptInvitation(
  db: Db,
  token: string,
  params: AcceptInvitationParams,
  auditContext: AuditContext = DEFAULT_WEB_AUDIT_CONTEXT,
): Promise<{ user: UserSummary }> {
  const invitation = await findByToken(db, token);
  if (!invitation) {
    throw new InvalidInvitationTokenError();
  }
  const state = deriveInvitationState(invitation, new Date());
  if (state !== "pending") {
    throwForNonPendingState(state);
  }

  const newUserId = randomUUID();

  return withAudit(
    db,
    async (tx) => {
      const accepted = await markAccepted(tx, invitation.id);
      if (!accepted) {
        // Lost the race (or expired between the initial lookup and here) —
        // re-read within this transaction to report the now-current state
        // rather than the stale one from before this call.
        const current = await findByToken(tx, token);
        const currentState = current ? deriveInvitationState(current, new Date()) : "revoked";
        throwForNonPendingState(
          currentState === "pending" ? "expired" : currentState,
        );
      }

      await insertValidatedUser(tx, {
        id: newUserId,
        organizationId: accepted.organizationId,
        teamId: accepted.teamId,
        username: params.username,
        displayName: params.displayName ?? params.username,
        email: accepted.email,
        password: params.password,
        role: accepted.role as "admin" | "member",
      });

      const user: UserSummary = {
        id: newUserId,
        orgId: accepted.organizationId,
        teamId: accepted.teamId,
        role: accepted.role as "admin" | "member",
        email: accepted.email,
      };
      return { user };
    },
    (tx) =>
      record(tx, {
        organizationId: invitation.organizationId,
        actorUserId: newUserId,
        actorApiKeyId: null,
        action: "invitation.accepted",
        resourceType: "invitation",
        resourceId: invitation.id,
        transport: auditContext.transport,
        sourceIp: auditContext.sourceIp ?? null,
      }),
  );
}
