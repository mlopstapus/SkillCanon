import { randomUUID } from "node:crypto";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import { createApiKey, login, registerFirstRunAdmin, type UserSummary } from "@/bcs/identity-access";

type Db = PostgresJsDatabase<Record<string, never>>;

/**
 * Logs in via the real, barrel-exported `login()` and returns a
 * `Cookie:`-ready header value — never signs a JWT directly via
 * `identity-access`'s internal `infrastructure/jwt.ts`, which `src/shared/api`
 * cannot import (boundaries lint, research.md). Exercises the real auth
 * path a route's `resolveCaller` will also exercise.
 */
export async function loginAndBuildCookie(
  authDb: Db,
  email: string,
  password: string,
): Promise<string> {
  const result = await login(authDb, email, password);
  if (!result) {
    throw new Error(`test helper: login failed for ${email}`);
  }
  return `${result.cookie.name}=${result.cookie.value}`;
}

/** Creates a real API key via the barrel-exported `createApiKey()` and returns a ready `Authorization` header value. */
export async function createApiKeyAndBuildAuthHeader(
  tx: Db,
  actingUser: UserSummary,
  name = "test-key",
  scopes: string[] = actingUser.role === "admin" ? ["test:write"] : ["test:read"],
): Promise<string> {
  const { rawKey } = await createApiKey(tx, actingUser, { name, scopes });
  return `Bearer ${rawKey}`;
}

export interface SeededOrg {
  organizationId: string;
  teamId: string;
  adminUserId: string;
  adminEmail: string;
  adminPassword: string;
}

/**
 * Seeds a fresh organization + root team + admin user via the barrel-
 * exported `registerFirstRunAdmin()` (real path, not a direct repo
 * insert — those are `identity-access`-internal and unreachable from
 * `src/shared/api`). Must be called against `authDb`.
 *
 * A second call in the same test file trips the self-hosted
 * single-organization guard (`SecondOrganizationNotAllowedError`) unless
 * the test first does `vi.stubEnv("STRIPE_ENABLED", "true")` — the
 * established codebase convention for any test needing more than one org
 * (e.g. a cross-org test), not something this helper stubs on its own.
 */
export async function seedOrgWithAdmin(authDb: Db): Promise<SeededOrg> {
  const suffix = randomUUID();
  const adminEmail = `admin-${suffix}@example.com`;
  const adminPassword = "correct-horse-battery-staple";
  const result = await registerFirstRunAdmin(authDb, {
    organization: { name: `Org ${suffix}`, slug: `org-${suffix}` },
    team: { name: "Root", slug: `root-${suffix}` },
    admin: { username: `admin-${suffix}`, email: adminEmail, password: adminPassword },
  });
  return {
    organizationId: result.organizationId,
    teamId: result.teamId,
    adminUserId: result.userId,
    adminEmail,
    adminPassword,
  };
}
