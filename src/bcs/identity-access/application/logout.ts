import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import {
  DEFAULT_WEB_AUDIT_CONTEXT,
  record,
  type AuditContext,
} from "@/bcs/audit-compliance";
import type { SessionCookieDescriptor } from "../domain/session";
import { SESSION_COOKIE_NAME } from "../domain/session";
import { getUser } from "./get-user";

type Db = PostgresJsDatabase<Record<string, never>>;

/**
 * Ends the current session (FR-007): no server-side session state exists
 * to invalidate (stateless JWT), so this simply audit-logs the logout
 * (FR-012) and returns a cookie descriptor clearing the client's cookie.
 * Idempotent by construction — there's nothing to check "was a session
 * active," so any real userId always succeeds.
 */
export async function logout(
  db: Db,
  userId: string,
  auditContext: AuditContext = DEFAULT_WEB_AUDIT_CONTEXT,
): Promise<{ cookie: SessionCookieDescriptor }> {
  const user = await getUser(db, userId);

  await db.transaction(async (tx) => {
    await record(tx, {
      organizationId: user.orgId,
      actorUserId: user.id,
      actorApiKeyId: null,
      action: "user.logout",
      resourceType: "user",
      resourceId: user.id,
      transport: auditContext.transport,
      sourceIp: auditContext.sourceIp ?? null,
    });
  });

  return {
    cookie: {
      name: SESSION_COOKIE_NAME,
      value: "",
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 0,
    },
  };
}
