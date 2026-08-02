import { randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createPrompt } from "@/bcs/prompt-registry";
import { withTenantContext } from "@/shared/db";
import { startTestDb, type TestDb } from "@/shared/db/test-helpers";
import { withApiRoute } from "@/shared/api/handler";
import { loginAndBuildCookie, seedOrgWithAdmin, type SeededOrg } from "@/shared/api/test-helpers";
import { handleGet, handlePost } from "./route";

describe("/api/skills", () => {
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
    const deps = { authDb: testDb.authDb, db: testDb.appDb };
    return {
      POST: withApiRoute(handlePost, deps),
      GET: withApiRoute(handleGet, deps),
    };
  }

  async function seedSkill(seeded: SeededOrg, name: string) {
    return withTenantContext(testDb.appDb, seeded.organizationId, (tx) =>
      createPrompt(tx, { organizationId: seeded.organizationId, userId: seeded.adminUserId }, {
        organizationId: seeded.organizationId,
        name,
      }),
    );
  }

  it("creates a skill and returns 201 with an id, always owned by the creating user", async () => {
    const seeded = await seedOrgWithAdmin(testDb.authDb);
    const cookie = await loginAndBuildCookie(testDb.authDb, seeded.adminEmail, seeded.adminPassword);
    const { POST } = route();

    const response = await POST(
      new Request("http://x/api/skills", {
        method: "POST",
        headers: { cookie, "content-type": "application/json" },
        body: JSON.stringify({ name: `weather-report-${randomUUID()}` }),
      }),
      { params: Promise.resolve({}) },
    );

    expect(response.status).toBe(201);
    const body = await response.json();
    expect(body.id).toBeTypeOf("string");
    expect(body.ownerType).toBe("user");
    expect(body.ownerId).toBe(seeded.adminUserId);
  });

  it("returns 401 with no credential", async () => {
    const { GET } = route();
    const response = await GET(new Request("http://x/api/skills"), { params: Promise.resolve({}) });
    expect(response.status).toBe(401);
  });

  it("returns 422 VALIDATION_FAILED for a missing required field", async () => {
    const seeded = await seedOrgWithAdmin(testDb.authDb);
    const cookie = await loginAndBuildCookie(testDb.authDb, seeded.adminEmail, seeded.adminPassword);
    const { POST } = route();

    const response = await POST(
      new Request("http://x/api/skills", {
        method: "POST",
        headers: { cookie, "content-type": "application/json" },
        body: JSON.stringify({}),
      }),
      { params: Promise.resolve({}) },
    );

    expect(response.status).toBe(422);
    const body = await response.json();
    expect(body.error.code).toBe("VALIDATION_FAILED");
  });

  it("lists skills scoped to the caller's own accessible set, paginated", async () => {
    const seededA = await seedOrgWithAdmin(testDb.authDb);
    const seededB = await seedOrgWithAdmin(testDb.authDb);
    const skillA = await seedSkill(seededA, `alpha-${randomUUID()}`);
    await seedSkill(seededB, `beta-${randomUUID()}`);
    const cookieA = await loginAndBuildCookie(testDb.authDb, seededA.adminEmail, seededA.adminPassword);
    const { GET } = route();

    const response = await GET(new Request("http://x/api/skills", { headers: { cookie: cookieA } }), {
      params: Promise.resolve({}),
    });

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.items.some((s: { id: string }) => s.id === skillA.id)).toBe(true);
    expect(body.items).toHaveLength(1);
    expect(body.page).toBe(1);
  });
});
