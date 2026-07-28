import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import type { AppSessionUser } from "../domain/user";
import { SESSION_COOKIE_NAME } from "../domain/session";
import { verifySessionJwt } from "../infrastructure/jwt";
import { findAppSessionUserById } from "../infrastructure/users-repo";

type Db = PostgresJsDatabase<Record<string, never>>;

function extractSessionToken(
  cookieHeader: string | null | undefined,
): string | null {
  if (!cookieHeader) {
    return null;
  }
  for (const part of cookieHeader.split(";")) {
    const [rawName, ...rest] = part.trim().split("=");
    if (rawName === SESSION_COOKIE_NAME) {
      return rest.join("=");
    }
  }
  return null;
}

/**
 * Resolves the calling user from a session cookie header (FR-005). Never
 * throws for a missing/invalid/expired session — resolves `null` — since
 * that's the routine "not signed in" outcome, not an infrastructure
 * failure. Re-reads the user's *current* org/team/role through the
 * application-session repository view, never trusting the JWT's own claims
 * beyond `sub` (context/auth-conventions.md).
 */
export async function authenticateSession(
  db: Db,
  cookieHeader: string | null | undefined,
): Promise<AppSessionUser | null> {
  const token = extractSessionToken(cookieHeader);
  if (!token) {
    return null;
  }
  const claims = await verifySessionJwt(token);
  if (!claims) {
    return null;
  }
  const user = await findAppSessionUserById(db, claims.sub);
  if (!user || !user.isActive) {
    return null;
  }
  // `teamId` set but `teamName` null means the join found no same-org team
  // for it — a cross-org data-integrity violation (M3), not a legitimate
  // unassigned user (whose `teamId` is null to begin with). Reject only the
  // former; a genuinely unassigned user resolves with both null
  // (019-account-team-settings-ui).
  if (user.teamId !== null && user.teamName === null) {
    return null;
  }
  return {
    id: user.id,
    orgId: user.orgId,
    teamId: user.teamId,
    role: user.role as AppSessionUser["role"],
    email: user.email,
    displayName: user.displayName,
    teamName: user.teamName,
  };
}
