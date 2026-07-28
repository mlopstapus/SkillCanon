export type UserRole = "admin" | "member";

export interface User {
  id: string;
  organizationId: string;
  /** Nullable since 019-account-team-settings-ui — null means "removed from their team, unassigned." */
  teamId: string | null;
  username: string;
  displayName: string;
  email: string;
  passwordHash: string | null;
  role: UserRole;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

/** This feature's own CRUD response shape — excludes `passwordHash` (FR-008). */
export interface UserAccountSummary {
  id: string;
  organizationId: string;
  teamId: string | null;
  username: string;
  displayName: string;
  email: string;
  role: UserRole;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

/** Stability-guaranteed shape per bcs/identity-access/CONTRACT.md — the only shape any other bounded context ever receives. */
export interface UserSummary {
  id: string;
  orgId: string;
  /** Nullable since 019-account-team-settings-ui — null means the user has been removed from their team and is awaiting reassignment. */
  teamId: string | null;
  role: UserRole;
  email: string;
}

/** Presentation-safe live identity returned only by browser session resolution. */
export interface AppSessionUser extends UserSummary {
  displayName: string;
  /** Null exactly when `teamId` is null (019-account-team-settings-ui). */
  teamName: string | null;
}

/** Thrown when a `(organization_id, email)` or `(organization_id, username)` uniqueness constraint is violated (FR-002). */
export class DuplicateUserError extends Error {
  constructor(field: "email" | "username") {
    super(`A user with this ${field} already exists in this organization.`);
    this.name = "DuplicateUserError";
  }
}

/** Thrown when a user's `teamId` does not belong to the same organization (FR-009). */
export class InvalidTeamAssignmentError extends Error {
  constructor() {
    super(
      "Cannot assign a user to a team in a different organization, or a nonexistent team.",
    );
    this.name = "InvalidTeamAssignmentError";
  }
}

/** Thrown when a supplied password is shorter than the 8-character minimum (FR-014). */
export class WeakPasswordError extends Error {
  constructor() {
    super("Password must be at least 8 characters.");
    this.name = "WeakPasswordError";
  }
}

/** Thrown when deactivating a user would leave an organization with zero active admins (FR-013). */
export class LastActiveAdminError extends Error {
  constructor() {
    super(
      "Cannot deactivate this user — they are the organization's last remaining active admin.",
    );
    this.name = "LastActiveAdminError";
  }
}

/** Thrown when the caller lacks permission for the requested operation (FR-003/FR-004/FR-005). */
export class NotAuthorizedError extends Error {
  constructor() {
    super("You do not have permission to perform this action.");
    this.name = "NotAuthorizedError";
  }
}

/** Thrown when a target user belongs to a different organization than the caller (M3). */
export class CrossOrgUserAccessError extends Error {
  constructor() {
    super("No user found with this id in your organization.");
    this.name = "CrossOrgUserAccessError";
  }
}

/**
 * Thrown by the entitlement-gate stand-in (research.md §4) — shaped with a
 * `code` matching the eventual real `DomainError`'s `ENTITLEMENT_REQUIRED`
 * (context/api-conventions.md), so the future swap to a real
 * `requireEntitlement()` call doesn't also change the error shape callers see.
 */
export class EntitlementRequiredError extends Error {
  code = "ENTITLEMENT_REQUIRED";

  constructor(key: string) {
    super(
      `This feature requires the "${key}" entitlement, which is not enabled.`,
    );
    this.name = "EntitlementRequiredError";
  }
}
