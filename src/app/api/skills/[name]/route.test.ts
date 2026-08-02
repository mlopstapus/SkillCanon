import { randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createPrompt } from "@/bcs/prompt-registry";
import { withTenantContext } from "@/shared/db";
import { startTestDb, type TestDb } from "@/shared/db/test-helpers";
import { withApiRoute } from "@/shared/api/handler";
import { loginAndBuildCookie, seedOrgWithAdmin, type SeededOrg } from "@/shared/api/test-helpers";
import { handleDelete, handleGet } from "./route";

describe("/api/skills/[name]", () => {
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
      GET: withApiRoute(handleGet, deps),
      DELETE: withApiRoute(handleDelete, deps),
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

  it("reads a skill by name", async () => {
    const seeded = await seedOrgWithAdmin(testDb.authDb);
    const name = `weather-${randomUUID()}`;
    await seedSkill(seeded, name);
    const cookie = await loginAndBuildCookie(testDb.authDb, seeded.adminEmail, seeded.adminPassword);
    const { GET } = route();

    const response = await GET(new Request(`http://x/api/skills/${name}`, { headers: { cookie } }), {
      params: Promise.resolve({ name }),
    });

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.name).toBe(name);
  });

  it("returns 404 SKILL_NOT_FOUND for a nonexistent skill name", async () => {
    const seeded = await seedOrgWithAdmin(testDb.authDb);
    const cookie = await loginAndBuildCookie(testDb.authDb, seeded.adminEmail, seeded.adminPassword);
    const { GET } = route();
    const bogusName = `bogus-${randomUUID()}`;

    const response = await GET(new Request(`http://x/api/skills/${bogusName}`, { headers: { cookie } }), {
      params: Promise.resolve({ name: bogusName }),
    });

    expect(response.status).toBe(404);
    const body = await response.json();
    expect(body.error.code).toBe("SKILL_NOT_FOUND");
  });

  it("returns 404 SKILL_NOT_FOUND for a skill belonging to a different organization (cross-org)", async () => {
    const seededA = await seedOrgWithAdmin(testDb.authDb);
    const seededB = await seedOrgWithAdmin(testDb.authDb);
    const name = `cross-org-skill-${randomUUID()}`;
    await seedSkill(seededB, name);
    const cookieA = await loginAndBuildCookie(testDb.authDb, seededA.adminEmail, seededA.adminPassword);
    const { GET } = route();

    const response = await GET(new Request(`http://x/api/skills/${name}`, { headers: { cookie: cookieA } }), {
      params: Promise.resolve({ name }),
    });

    expect(response.status).toBe(404);
    const body = await response.json();
    expect(body.error.code).toBe("SKILL_NOT_FOUND");
  });

  it("deprecates a skill", async () => {
    const seeded = await seedOrgWithAdmin(testDb.authDb);
    const name = `deprecate-me-${randomUUID()}`;
    await seedSkill(seeded, name);
    const cookie = await loginAndBuildCookie(testDb.authDb, seeded.adminEmail, seeded.adminPassword);
    const { DELETE } = route();

    const response = await DELETE(
      new Request(`http://x/api/skills/${name}`, { method: "DELETE", headers: { cookie } }),
      { params: Promise.resolve({ name }) },
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.isDeprecated).toBe(true);
  });

  it("returns 404 SKILL_NOT_FOUND deleting a nonexistent skill", async () => {
    const seeded = await seedOrgWithAdmin(testDb.authDb);
    const cookie = await loginAndBuildCookie(testDb.authDb, seeded.adminEmail, seeded.adminPassword);
    const { DELETE } = route();
    const bogusName = `bogus-${randomUUID()}`;

    const response = await DELETE(
      new Request(`http://x/api/skills/${bogusName}`, { method: "DELETE", headers: { cookie } }),
      { params: Promise.resolve({ name: bogusName }) },
    );

    expect(response.status).toBe(404);
    const body = await response.json();
    expect(body.error.code).toBe("SKILL_NOT_FOUND");
  });

  it("returns 401 with no credential", async () => {
    const { GET } = route();
    const response = await GET(new Request("http://x/api/skills/anything"), {
      params: Promise.resolve({ name: "anything" }),
    });
    expect(response.status).toBe(401);
  });
});
