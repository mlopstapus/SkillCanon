import bcrypt from "bcryptjs";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import {
  DEFAULT_WEB_AUDIT_CONTEXT,
  record,
  type AuditContext,
} from "@/bcs/audit-compliance";
import type { UserSummary } from "../domain/user";
import type { SessionCookieDescriptor } from "../domain/session";
import { SESSION_COOKIE_NAME } from "../domain/session";
import { findByEmail } from "../infrastructure/users-repo";
import { getJwtExpiryHours } from "@/shared/config";
import { signSessionJwt } from "../infrastructure/jwt";

type Db = PostgresJsDatabase<Record<string, never>>;

function buildCookie(value: string, maxAgeSeconds?: number): SessionCookieDescriptor {
  return {
    name: SESSION_COOKIE_NAME,
    value,
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    ...(maxAgeSeconds === undefined ? {} : { maxAge: maxAgeSeconds }),
  };
}

/**
 * Authenticates by email + password (FR-001/FR-002). Email lookup spans all
 * organizations since login has no org context yet (research.md §8).
 * Audit-logs every outcome (success or failure) before returning (FR-011,
 * FR-013) — an audit-write failure throws rather than reporting success.
 */
export async function login(
  db: Db,
  email: string,
  password: string,
  auditContext: AuditContext = DEFAULT_WEB_AUDIT_CONTEXT,
): Promise<{ user: UserSummary; cookie: SessionCookieDescriptor } | null> {
  const normalizedEmail = email.toLowerCase();
  const candidates = await findByEmail(db, normalizedEmail);
  const activeCandidates = candidates.filter((c) => c.isActive);

  let matched: (typeof candidates)[number] | undefined;
  for (const candidate of activeCandidates) {
    if (
      candidate.passwordHash &&
      (await bcrypt.compare(password, candidate.passwordHash))
    ) {
      matched = candidate;
      break;
    }
  }

  return db.transaction(async (tx) => {
    if (matched) {
      const claims = { sub: matched.id, role: matched.role };
      const token = await signSessionJwt(claims);
      await record(tx, {
        organizationId: matched.organizationId,
        actorUserId: matched.id,
        actorApiKeyId: null,
        action: "user.login",
        resourceType: "user",
        resourceId: matched.id,
        transport: auditContext.transport,
        sourceIp: auditContext.sourceIp ?? null,
      });
      const user: UserSummary = {
        id: matched.id,
        orgId: matched.organizationId,
        teamId: matched.teamId,
        role: matched.role,
        email: matched.email,
      };
      return {
        user,
        cookie: buildCookie(token, getJwtExpiryHours() * 3600),
      };
    }

    // Failed attempt — attribute to a single real account only when the
    // email unambiguously resolves to exactly one (research.md §8).
    const single = candidates.length === 1 ? candidates[0] : undefined;
    await record(tx, {
      organizationId: single?.organizationId ?? null,
      actorUserId: single?.id ?? null,
      actorApiKeyId: null,
      action: "user.login_failed",
      resourceType: "user",
      resourceId: single?.id ?? null,
      transport: auditContext.transport,
      sourceIp: auditContext.sourceIp ?? null,
    });
    return null;
  });
}
