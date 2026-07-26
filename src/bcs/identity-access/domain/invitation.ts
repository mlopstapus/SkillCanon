export type InvitationRole = "admin" | "member";
export type InvitationState = "pending" | "accepted" | "expired" | "revoked";

export interface Invitation {
  id: string;
  organizationId: string;
  teamId: string;
  email: string;
  role: InvitationRole;
  token: string;
  invitedById: string;
  acceptedAt: Date | null;
  revokedAt: Date | null;
  expiresAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

/** FR-011's list shape — never includes `token` (data-model.md). */
export interface InvitationSummary {
  id: string;
  email: string;
  teamId: string;
  role: InvitationRole;
  state: InvitationState;
  createdAt: Date;
}

/**
 * Display-only shape for an anonymous, pre-auth invitee viewing their own
 * invite link before deciding to accept it — never includes `token`, `id`,
 * or any identifier usable to look up a different invitation. Distinct from
 * `InvitationSummary`, which is org-admin-only and lists many invitations
 * by id.
 */
export interface InvitationPreview {
  state: InvitationState;
  email: string;
  orgName: string;
  teamName: string;
  role: InvitationRole;
}

/**
 * Precedence is fixed and mutually exclusive: `revoked` first (a revoke can
 * happen after the clock has already passed `expiresAt`, and should still
 * reflect the deliberate action), then `accepted`, then the expiry
 * comparison, defaulting to `pending` (data-model.md).
 */
export function deriveInvitationState(
  row: { acceptedAt: Date | null; revokedAt: Date | null; expiresAt: Date },
  now: Date,
): InvitationState {
  if (row.revokedAt !== null) {
    return "revoked";
  }
  if (row.acceptedAt !== null) {
    return "accepted";
  }
  if (row.expiresAt <= now) {
    return "expired";
  }
  return "pending";
}

/** Thrown when an active (pending, unexpired, unrevoked) invitation already exists for `(organizationId, email)` (FR-003). */
export class DuplicateInvitationError extends Error {
  constructor() {
    super("An active invitation already exists for this email in this organization.");
    this.name = "DuplicateInvitationError";
  }
}

/** Thrown when `acceptInvitation` is called with a token matching no row at all. */
export class InvalidInvitationTokenError extends Error {
  constructor() {
    super("This invitation link is not valid.");
    this.name = "InvalidInvitationTokenError";
  }
}

/** Thrown when the invitation's derived state is `"expired"` at accept time (FR-008). */
export class InvitationExpiredError extends Error {
  constructor() {
    super("This invitation has expired.");
    this.name = "InvitationExpiredError";
  }
}

/**
 * Thrown when the invitation's derived state is `"accepted"` at accept time
 * (FR-008), or when `revokeInvitation` is called on an already-accepted
 * invitation (FR-010) — there is nothing left to revoke.
 */
export class InvitationAlreadyAcceptedError extends Error {
  constructor() {
    super("This invitation has already been accepted.");
    this.name = "InvitationAlreadyAcceptedError";
  }
}

/** Thrown when the invitation's derived state is `"revoked"` at accept time (FR-008). */
export class InvitationRevokedError extends Error {
  constructor() {
    super("This invitation has been revoked.");
    this.name = "InvitationRevokedError";
  }
}

/** Thrown when `revokeInvitation`/`listInvitations`-style lookups find no matching row in the caller's organization. */
export class InvitationNotFoundError extends Error {
  constructor() {
    super("No invitation found with this id in your organization.");
    this.name = "InvitationNotFoundError";
  }
}
