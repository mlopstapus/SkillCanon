import type { AppSessionUser } from "@/bcs/identity-access";

/**
 * Admin-only gate for the Audit Log page (FR-001/FR-016) — kept as a pure,
 * standalone function so it's unit-testable, mirroring `isScopeAllowedForRole`'s
 * precedent for extracting gate logic out of a server component.
 */
export function canAccessAuditLog(user: AppSessionUser): boolean {
  return user.role === "admin";
}
