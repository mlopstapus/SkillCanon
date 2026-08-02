import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import type { AuditContext } from "@/bcs/audit-compliance";
import { authenticateApiKey, authenticateSession, type UserSummary } from "@/bcs/identity-access";
import { authDb as defaultAuthDb } from "@/shared/db";

export interface ResolvedCaller {
  actingUser: UserSummary;
  organizationId: string;
  auditContext: AuditContext;
}

export function apiAuditContext(request: Request): AuditContext {
  return {
    transport: "api",
    sourceIp: request.headers.get("x-forwarded-for"),
  };
}

/**
 * Resolves the calling identity from either an `Authorization: Bearer`
 * API key or a session cookie — uniformly, on every route (FR-010,
 * 2026-08-02 clarification). Bearer is checked first so an API-key caller
 * never silently falls back to a stray browser cookie on the same
 * request. Both underlying functions require `authDb`, not the ordinary
 * tenant-scoped `db` (FR-016) — this is the only file in `src/shared/api`
 * that imports the real `authDb` singleton.
 *
 * `authDbClient` defaults to the real singleton so production route
 * handlers never need to pass it — tests inject `testDb.authDb` instead,
 * matching every BC application function's own explicit-`db`-parameter
 * convention (the singleton has no test seam of its own: it's a
 * lazily-initialized module-level client keyed off `AUTH_DATABASE_URL`,
 * not swappable per call once created).
 */
export async function resolveCaller(
  request: Request,
  authDbClient: PostgresJsDatabase<Record<string, never>> = defaultAuthDb,
): Promise<ResolvedCaller | null> {
  const auditContext = apiAuditContext(request);
  const authHeader = request.headers.get("authorization");
  const bearerMatch = authHeader?.match(/^Bearer\s+(.+)$/i);
  const rawKey = bearerMatch?.[1];

  if (rawKey) {
    const result = await authenticateApiKey(authDbClient, rawKey);
    if (!result) {
      return null;
    }
    return { actingUser: result.user, organizationId: result.user.orgId, auditContext };
  }

  const user = await authenticateSession(authDbClient, request.headers.get("cookie"));
  if (!user) {
    return null;
  }
  return { actingUser: user, organizationId: user.orgId, auditContext };
}
