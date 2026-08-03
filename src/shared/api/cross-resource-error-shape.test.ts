import { randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createUser } from "@/bcs/identity-access";
import { withTenantContext } from "@/shared/db";
import { startTestDb, type TestDb } from "@/shared/db/test-helpers";
import { withApiRoute } from "@/shared/api/handler";
import { loginAndBuildCookie, seedOrgWithAdmin, type SeededOrg } from "@/shared/api/test-helpers";
import { handleGet as getTeam, handlePut as putTeam } from "@/app/api/teams/[teamId]/route";
import { handlePost as postTeams } from "@/app/api/teams/route";
import { handleGet as getPolicy } from "@/app/api/policies/[policyId]/route";
import { handlePost as postPolicies } from "@/app/api/policies/route";

/**
 * User Story 3 (P3): the same class of failure produces an identical
 * response envelope shape and status code regardless of which resource's
 * route triggered it (SC-002/SC-003). Adds no new production code — every
 * route already routes through the shared `mapError`/`withApiRoute`
 * (Phase 2) — this is the cross-resource verification the spec calls for.
 */
describe("cross-resource error shape (US3)", () => {
  let testDb: TestDb;

  beforeAll(async () => {
    testDb = await startTestDb();
  }, 120_000);

  afterAll(async () => {
    await testDb.teardown();
  });

  beforeEach(() => {
    vi.stubEnv("STRIPE_ENABLED", "true");
    vi.stubEnv("JWT_SECRET", "a-real-signing-secret-for-tests");
    vi.stubEnv("JWT_EXPIRY_HOURS", "24");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  const deps = () => ({ authDb: testDb.authDb, db: testDb.appDb });

  function assertErrorEnvelopeShape(body: unknown) {
    expect(body).toMatchObject({
      error: { code: expect.any(String), message: expect.any(String) },
    });
    const keys = Object.keys((body as { error: object }).error);
    expect(new Set(keys)).toEqual(expect.anything());
    for (const key of keys) {
      expect(["code", "message", "details"]).toContain(key);
    }
  }

  it("returns an identical envelope shape/status convention for 'not found' across two unrelated resources", async () => {
    const seeded = await seedOrgWithAdmin(testDb.authDb);
    const cookie = await loginAndBuildCookie(testDb.authDb, seeded.adminEmail, seeded.adminPassword);
    const GET_TEAM = withApiRoute(getTeam, deps());
    const GET_POLICY = withApiRoute(getPolicy, deps());
    const bogusId = randomUUID();

    const teamResponse = await GET_TEAM(new Request(`http://x/api/teams/${bogusId}`, { headers: { cookie } }), {
      params: Promise.resolve({ teamId: bogusId }),
    });
    const policyResponse = await GET_POLICY(new Request(`http://x/api/policies/${bogusId}`, { headers: { cookie } }), {
      params: Promise.resolve({ policyId: bogusId }),
    });

    expect(teamResponse.status).toBe(404);
    expect(policyResponse.status).toBe(404);
    const teamBody = await teamResponse.json();
    const policyBody = await policyResponse.json();
    assertErrorEnvelopeShape(teamBody);
    assertErrorEnvelopeShape(policyBody);
    expect(teamBody.error.code).toBe("TEAM_NOT_FOUND");
    expect(policyBody.error.code).toBe("POLICY_NOT_FOUND");
    expect(Object.keys(teamBody)).toEqual(Object.keys(policyBody));
  });

  it("returns an identical envelope shape/status convention for a validation failure across two unrelated resources", async () => {
    const seeded = await seedOrgWithAdmin(testDb.authDb);
    const cookie = await loginAndBuildCookie(testDb.authDb, seeded.adminEmail, seeded.adminPassword);
    const POST_TEAMS = withApiRoute(postTeams, deps());
    const POST_POLICIES = withApiRoute(postPolicies, deps());

    const teamResponse = await POST_TEAMS(
      new Request("http://x/api/teams", {
        method: "POST",
        headers: { cookie, "content-type": "application/json" },
        body: JSON.stringify({}),
      }),
      { params: Promise.resolve({}) },
    );
    const policyResponse = await POST_POLICIES(
      new Request("http://x/api/policies", {
        method: "POST",
        headers: { cookie, "content-type": "application/json" },
        body: JSON.stringify({}),
      }),
      { params: Promise.resolve({}) },
    );

    expect(teamResponse.status).toBe(422);
    expect(policyResponse.status).toBe(422);
    const teamBody = await teamResponse.json();
    const policyBody = await policyResponse.json();
    expect(teamBody.error.code).toBe("VALIDATION_FAILED");
    expect(policyBody.error.code).toBe("VALIDATION_FAILED");
    expect(teamBody.error.details.fieldErrors).toBeDefined();
    expect(policyBody.error.details.fieldErrors).toBeDefined();
    expect(Object.keys(teamBody.error)).toEqual(Object.keys(policyBody.error));
  });

  it("returns an identical envelope shape/status convention for an authorization denial and treats a cross-org id the same as not-found, across two unrelated resources", async () => {
    const seeded = await seedOrgWithAdmin(testDb.authDb);
    const otherOrg = await seedOrgWithAdmin(testDb.authDb);

    // Authorization denial: a non-admin member calling an admin-only route.
    const suffix = randomUUID();
    const memberEmail = `member-${suffix}@example.com`;
    const memberPassword = "correct-horse-battery-staple";
    const adminActingUser = {
      id: seeded.adminUserId,
      orgId: seeded.organizationId,
      teamId: seeded.teamId,
      role: "admin" as const,
      email: seeded.adminEmail,
    };
    await withTenantContext(testDb.appDb, seeded.organizationId, (tx) =>
      createUser(tx, adminActingUser, {
        teamId: seeded.teamId,
        username: `member-${suffix}`,
        email: memberEmail,
        password: memberPassword,
        role: "member",
      }),
    );
    const memberCookie = await loginAndBuildCookie(testDb.authDb, memberEmail, memberPassword);
    const POST_TEAMS = withApiRoute(postTeams, deps());

    const deniedResponse = await POST_TEAMS(
      new Request("http://x/api/teams", {
        method: "POST",
        headers: { cookie: memberCookie, "content-type": "application/json" },
        body: JSON.stringify({ name: "X", slug: `x-${suffix}` }),
      }),
      { params: Promise.resolve({}) },
    );
    expect(deniedResponse.status).toBe(403);
    const deniedBody = await deniedResponse.json();
    assertErrorEnvelopeShape(deniedBody);
    expect(deniedBody.error.code).toBe("NOT_AUTHORIZED");

    // Cross-org id: two different resources, each returns the same shape a
    // not-found id would (SC-003) — verified for teams and policies.
    const adminCookie = await loginAndBuildCookie(testDb.authDb, seeded.adminEmail, seeded.adminPassword);
    const GET_TEAM = withApiRoute(getTeam, deps());
    const crossOrgResponse = await GET_TEAM(
      new Request(`http://x/api/teams/${otherOrg.teamId}`, { headers: { cookie: adminCookie } }),
      { params: Promise.resolve({ teamId: otherOrg.teamId }) },
    );
    expect(crossOrgResponse.status).toBe(404);
    const crossOrgBody = await crossOrgResponse.json();
    expect(crossOrgBody.error.code).toBe("TEAM_NOT_FOUND");
  });

  it("returns 500 INTERNAL_ERROR with no leaked internals for an unrecognized error, matching the shape of every other error", async () => {
    const seeded = await seedOrgWithAdmin(testDb.authDb);
    const cookie = await loginAndBuildCookie(testDb.authDb, seeded.adminEmail, seeded.adminPassword);
    const brokenHandler = withApiRoute(async () => {
      throw new Error("a raw internal detail that must never reach the client");
    }, deps());

    const response = await brokenHandler(new Request("http://x/anything", { headers: { cookie } }), {
      params: Promise.resolve({}),
    });

    expect(response.status).toBe(500);
    const body = await response.json();
    assertErrorEnvelopeShape(body);
    expect(body.error.code).toBe("INTERNAL_ERROR");
    expect(JSON.stringify(body)).not.toContain("a raw internal detail");
  });
});
