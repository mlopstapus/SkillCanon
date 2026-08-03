import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { PolicyNotFoundError } from "@/bcs/governance";
import { startTestDb, type TestDb } from "@/shared/db/test-helpers";
import { withApiRoute } from "./handler";
import { createApiKeyAndBuildAuthHeader, loginAndBuildCookie, seedOrgWithAdmin } from "./test-helpers";

describe("withApiRoute", () => {
  let testDb: TestDb;

  beforeAll(async () => {
    testDb = await startTestDb();
  }, 120_000);

  afterAll(async () => {
    await testDb.teardown();
  });

  // Each `it()` below seeds its own fresh org via seedOrgWithAdmin — bypass
  // the self-hosted single-organization guard (CLAUDE.md) rather than
  // sharing one seeded org across cases.
  beforeEach(() => {
    vi.stubEnv("STRIPE_ENABLED", "true");
    vi.stubEnv("JWT_SECRET", "a-real-signing-secret-for-tests");
    vi.stubEnv("JWT_EXPIRY_HOURS", "24");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("rejects a request with no credential as 401 UNAUTHENTICATED before invoking the handler", async () => {
    let invoked = false;
    const handler = withApiRoute(async () => {
      invoked = true;
      return new Response(null, { status: 204 });
    }, { authDb: testDb.authDb });

    const response = await handler(new Request("http://x/teams"), { params: Promise.resolve({}) });

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: { code: "UNAUTHENTICATED", message: expect.any(String) } });
    expect(invoked).toBe(false);
  });

  it("resolves the caller from a session cookie and invokes the handler", async () => {
    const seeded = await seedOrgWithAdmin(testDb.authDb);
    const cookie = await loginAndBuildCookie(testDb.authDb, seeded.adminEmail, seeded.adminPassword);

    const handler = withApiRoute(async (_req, { caller }) => {
      return Response.json({ orgId: caller.organizationId, userId: caller.actingUser.id });
    }, { authDb: testDb.authDb });

    const response = await handler(new Request("http://x/teams", { headers: { cookie } }), {
      params: Promise.resolve({}),
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ orgId: seeded.organizationId, userId: seeded.adminUserId });
  });

  it("resolves the caller from an Authorization: Bearer API key and invokes the handler", async () => {
    const seeded = await seedOrgWithAdmin(testDb.authDb);
    const actingUser = {
      id: seeded.adminUserId,
      orgId: seeded.organizationId,
      teamId: seeded.teamId,
      role: "admin" as const,
      email: seeded.adminEmail,
    };
    const authHeader = await createApiKeyAndBuildAuthHeader(testDb.authDb, actingUser);

    const handler = withApiRoute(async (_req, { caller }) => {
      return Response.json({ orgId: caller.organizationId });
    }, { authDb: testDb.authDb });

    const response = await handler(new Request("http://x/teams", { headers: { authorization: authHeader } }), {
      params: Promise.resolve({}),
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ orgId: seeded.organizationId });
  });

  it("prefers the Bearer credential over a cookie present on the same request", async () => {
    const seededA = await seedOrgWithAdmin(testDb.authDb);
    const cookie = await loginAndBuildCookie(testDb.authDb, seededA.adminEmail, seededA.adminPassword);
    const actingUserA = {
      id: seededA.adminUserId,
      orgId: seededA.organizationId,
      teamId: seededA.teamId,
      role: "admin" as const,
      email: seededA.adminEmail,
    };
    const authHeader = await createApiKeyAndBuildAuthHeader(testDb.authDb, actingUserA);

    const handler = withApiRoute(async (_req, { caller }) => {
      return Response.json({ orgId: caller.organizationId });
    }, { authDb: testDb.authDb });

    const response = await handler(
      new Request("http://x/teams", { headers: { cookie, authorization: authHeader } }),
      { params: Promise.resolve({}) },
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ orgId: seededA.organizationId });
  });

  it("awaits and passes through route params", async () => {
    const seeded = await seedOrgWithAdmin(testDb.authDb);
    const cookie = await loginAndBuildCookie(testDb.authDb, seeded.adminEmail, seeded.adminPassword);

    const handler = withApiRoute<{ teamId: string }>(async (_req, { params }) => {
      return Response.json({ teamId: params.teamId });
    }, { authDb: testDb.authDb });

    const response = await handler(new Request("http://x/teams/abc", { headers: { cookie } }), {
      params: Promise.resolve({ teamId: "abc" }),
    });

    expect(await response.json()).toEqual({ teamId: "abc" });
  });

  it("maps a thrown domain error through mapError", async () => {
    const seeded = await seedOrgWithAdmin(testDb.authDb);
    const cookie = await loginAndBuildCookie(testDb.authDb, seeded.adminEmail, seeded.adminPassword);

    const handler = withApiRoute(async () => {
      throw new PolicyNotFoundError("bogus-policy-id");
    }, { authDb: testDb.authDb });

    const response = await handler(new Request("http://x/policies/bogus-policy-id", { headers: { cookie } }), {
      params: Promise.resolve({}),
    });

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({
      error: { code: "POLICY_NOT_FOUND", message: expect.any(String) },
    });
  });

  it("maps an unrecognized thrown error to 500 INTERNAL_ERROR", async () => {
    const seeded = await seedOrgWithAdmin(testDb.authDb);
    const cookie = await loginAndBuildCookie(testDb.authDb, seeded.adminEmail, seeded.adminPassword);

    const handler = withApiRoute(async () => {
      throw new Error("something broke");
    }, { authDb: testDb.authDb });

    const response = await handler(new Request("http://x/teams", { headers: { cookie } }), {
      params: Promise.resolve({}),
    });

    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({
      error: { code: "INTERNAL_ERROR", message: expect.any(String) },
    });
  });
});
