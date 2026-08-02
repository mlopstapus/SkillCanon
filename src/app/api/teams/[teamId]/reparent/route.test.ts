import { randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createTeam } from "@/bcs/identity-access";
import { withTenantContext } from "@/shared/db";
import { startTestDb, type TestDb } from "@/shared/db/test-helpers";
import { withApiRoute } from "@/shared/api/handler";
import { loginAndBuildCookie, seedOrgWithAdmin } from "@/shared/api/test-helpers";
import { handlePost } from "./route";

describe("/api/teams/[teamId]/reparent", () => {
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

  function route() {
    return withApiRoute(handlePost, { authDb: testDb.authDb, db: testDb.appDb });
  }

  it("reparents a team under a new sibling", async () => {
    const seeded = await seedOrgWithAdmin(testDb.authDb);
    const cookie = await loginAndBuildCookie(testDb.authDb, seeded.adminEmail, seeded.adminPassword);
    const newParent = await withTenantContext(testDb.appDb, seeded.organizationId, (tx) =>
      createTeam(tx, { organizationId: seeded.organizationId, name: "New Parent", slug: `np-${randomUUID()}` }),
    );
    const POST = route();

    const response = await POST(
      new Request(`http://x/api/teams/${seeded.teamId}/reparent`, {
        method: "POST",
        headers: { cookie, "content-type": "application/json" },
        body: JSON.stringify({ newParentTeamId: newParent.id }),
      }),
      { params: Promise.resolve({ teamId: seeded.teamId }) },
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.parentTeamId).toBe(newParent.id);
  });

  it("returns 422 TEAM_HIERARCHY_CYCLE when reparenting a team under itself", async () => {
    const seeded = await seedOrgWithAdmin(testDb.authDb);
    const cookie = await loginAndBuildCookie(testDb.authDb, seeded.adminEmail, seeded.adminPassword);
    const POST = route();

    const response = await POST(
      new Request(`http://x/api/teams/${seeded.teamId}/reparent`, {
        method: "POST",
        headers: { cookie, "content-type": "application/json" },
        body: JSON.stringify({ newParentTeamId: seeded.teamId }),
      }),
      { params: Promise.resolve({ teamId: seeded.teamId }) },
    );

    expect(response.status).toBe(422);
    const body = await response.json();
    expect(body.error.code).toBe("TEAM_HIERARCHY_CYCLE");
  });

  it("returns 404 TEAM_NOT_FOUND for a nonexistent newParentTeamId", async () => {
    const seeded = await seedOrgWithAdmin(testDb.authDb);
    const cookie = await loginAndBuildCookie(testDb.authDb, seeded.adminEmail, seeded.adminPassword);
    const POST = route();

    const response = await POST(
      new Request(`http://x/api/teams/${seeded.teamId}/reparent`, {
        method: "POST",
        headers: { cookie, "content-type": "application/json" },
        body: JSON.stringify({ newParentTeamId: randomUUID() }),
      }),
      { params: Promise.resolve({ teamId: seeded.teamId }) },
    );

    expect(response.status).toBe(404);
    const body = await response.json();
    expect(body.error.code).toBe("TEAM_NOT_FOUND");
  });

  it("returns 401 with no credential", async () => {
    const POST = route();
    const response = await POST(new Request("http://x/api/teams/x/reparent", { method: "POST" }), {
      params: Promise.resolve({ teamId: "x" }),
    });
    expect(response.status).toBe(401);
  });
});
