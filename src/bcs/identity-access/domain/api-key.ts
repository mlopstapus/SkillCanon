import type { UserRole } from "./user";

export interface ApiKey {
  id: string;
  organizationId: string;
  userId: string;
  name: string;
  keyHash: string;
  prefix: string;
  scopes: string[];
  expiresAt: Date | null;
  isActive: boolean;
  lastUsedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

/** FR-009's list/detail shape — never includes `keyHash` or the raw key. */
export interface ApiKeySummary {
  id: string;
  userId: string;
  name: string;
  prefix: string;
  scopes: string[];
  expiresAt: Date | null;
  isActive: boolean;
  lastUsedAt: Date | null;
  createdAt: Date;
}

/**
 * `<resource>:<action>` shape, action drawn from a small fixed set — not a
 * closed enum of known resources (research.md §1, per this feature's
 * /speckit-clarify answer). `identity-access` does not own or validate
 * other bounded contexts' resource definitions.
 */
const SCOPE_SHAPE = /^[a-z][a-z0-9-]*:(read|write|run)$/;

export function isValidScopeShape(scope: string): boolean {
  return SCOPE_SHAPE.test(scope);
}

/**
 * Whether `role` may request `scope` on a new key (FR-003, research.md §2).
 * This codebase has no per-resource permission matrix yet — role is the
 * only privilege axis that currently exists, so the cap maps onto it
 * directly: `"admin"` may request any well-formed scope; `"member"` may
 * request only `:read` scopes, mirroring every other admin-vs-member split
 * already established in this bounded context.
 */
export function isScopeAllowedForRole(scope: string, role: UserRole): boolean {
  if (role === "admin") {
    return true;
  }
  // `evals:run` is open to members: who may evaluate a skill is decided by skill access, not by this cap (017/003 part 2).
  return scope.endsWith(":read") || scope === "evals:run";
}

/** Thrown when `createApiKey` is called with an empty `scopes` array (FR-002). */
export class NoScopesSelectedError extends Error {
  constructor() {
    super("An API key must be created with at least one scope.");
    this.name = "NoScopesSelectedError";
  }
}

/** Thrown when a requested scope doesn't match the `<resource>:<action>` shape (FR-002). */
export class InvalidScopeError extends Error {
  constructor(scope: string) {
    super(`"${scope}" is not a valid scope. Scopes must match <resource>:<action> (read, write, or run).`);
    this.name = "InvalidScopeError";
  }
}

/** Thrown when a requested scope exceeds the creating user's own current permissions (FR-003). */
export class ScopeExceedsPermissionsError extends Error {
  constructor(scope: string) {
    super(`You do not have permission to create a key with the "${scope}" scope.`);
    this.name = "ScopeExceedsPermissionsError";
  }
}

/** Thrown when `revokeApiKey` is called with an id matching no row in the caller's organization. */
export class ApiKeyNotFoundError extends Error {
  constructor() {
    super("No API key found with this id in your organization.");
    this.name = "ApiKeyNotFoundError";
  }
}
