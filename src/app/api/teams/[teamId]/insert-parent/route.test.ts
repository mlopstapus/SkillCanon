import { randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { getTeam } from "@/bcs/identity-access";
import { withTenantContext } from "@/shared/db";
import { startTestDb, type TestDb } from "@/shared/db/test-helpers";
import { withApiRoute } from "@/shared/api/handler";
import { loginAndBuildCookie, seedOrgWithAdmin } from "@/shared/api/test-helpers";
import { handlePost } from "./route";

describe("/api/teams/[teamId]/insert-parent", () => {
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

  it("inserts a new team above the given team and reparents it underneath", async () => {
    const seeded = await seedOrgWithAdmin(testDb.authDb);
    const cookie = await loginAndBuildCookie(testDb.authDb, seeded.adminEmail, seeded.adminPassword);
    const POST = route();

    const response = await POST(
      new Request(`http://x/api/teams/${seeded.teamId}/insert-parent`, {
        method: "POST",
        headers: { cookie, "content-type": "application/json" },
        body: JSON.stringify({ name: "Middle", slug: `middle-${randomUUID()}` }),
      }),
      { params: Promise.resolve({ teamId: seeded.teamId }) },
    );

    expect(response.status).toBe(201);
    const body = await response.json();
    expect(body.id).toBeTypeOf("string");

    const child = await withTenantContext(testDb.appDb, seeded.organizationId, (tx) =>
      getTeam(tx, seeded.organizationId, seeded.teamId),
    );
    expect(child.parentTeamId).toBe(body.id);
  });

  it("returns 404 TEAM_NOT_FOUND for a nonexistent childTeamId", async () => {
    const seeded = await seedOrgWithAdmin(testDb.authDb);
    const cookie = await loginAndBuildCookie(testDb.authDb, seeded.adminEmail, seeded.adminPassword);
    const POST = route();
    const bogusId = randomUUID();

    const response = await POST(
      new Request(`http://x/api/teams/${bogusId}/insert-parent`, {
        method: "POST",
        headers: { cookie, "content-type": "application/json" },
        body: JSON.stringify({ name: "Middle", slug: `middle-${randomUUID()}` }),
      }),
      { params: Promise.resolve({ teamId: bogusId }) },
    );

    expect(response.status).toBe(404);
    const body = await response.json();
    expect(body.error.code).toBe("TEAM_NOT_FOUND");
  });

  it("returns 401 with no credential", async () => {
    const POST = route();
    const response = await POST(new Request("http://x/api/teams/x/insert-parent", { method: "POST" }), {
      params: Promise.resolve({ teamId: "x" }),
    });
    expect(response.status).toBe(401);
  });
});
