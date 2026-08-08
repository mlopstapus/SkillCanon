import { randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createPrompt, publishVersion } from "@/bcs/prompt-registry";
import { withTenantContext } from "@/shared/db";
import { startTestDb, type TestDb } from "@/shared/db/test-helpers";
import { withApiRoute } from "@/shared/api/handler";
import { loginAndBuildCookie, seedOrgWithAdmin, type SeededOrg } from "@/shared/api/test-helpers";
import { handlePost } from "./route";

describe("/api/skills/[name]/rollback", () => {
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
    };
  }

  async function seedSkillWithTwoVersions(seeded: SeededOrg, name: string) {
    const actor = { organizationId: seeded.organizationId, userId: seeded.adminUserId };
    await withTenantContext(testDb.appDb, seeded.organizationId, (tx) =>
      createPrompt(tx, actor, { organizationId: seeded.organizationId, name }),
    );
    const v1 = await withTenantContext(testDb.appDb, seeded.organizationId, (tx) =>
      publishVersion(tx, actor, {
        organizationId: seeded.organizationId,
        promptName: name,
        version: "v1",
        mainFile: { content: "v1 content" },
      }),
    );
    await withTenantContext(testDb.appDb, seeded.organizationId, (tx) =>
      publishVersion(tx, actor, {
        organizationId: seeded.organizationId,
        promptName: name,
        version: "v2",
        mainFile: { content: "v2 content" },
      }),
    );
    return { v1 };
  }

  it("rolls back the active version and returns the updated skill", async () => {
    const seeded = await seedOrgWithAdmin(testDb.authDb);
    const name = `rollback-me-${randomUUID()}`;
    const { v1 } = await seedSkillWithTwoVersions(seeded, name);
    const cookie = await loginAndBuildCookie(testDb.authDb, seeded.adminEmail, seeded.adminPassword);
    const { POST } = route();

    const response = await POST(
      new Request(`http://x/api/skills/${name}/rollback`, {
        method: "POST",
        headers: { cookie, "content-type": "application/json" },
        body: JSON.stringify({ version: "v1" }),
      }),
      { params: Promise.resolve({ name }) },
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.activeVersionId).toBe(v1.id);
  });

  it("returns 404 SKILL_NOT_FOUND for a nonexistent skill", async () => {
    const seeded = await seedOrgWithAdmin(testDb.authDb);
    const cookie = await loginAndBuildCookie(testDb.authDb, seeded.adminEmail, seeded.adminPassword);
    const { POST } = route();
    const bogusName = `bogus-${randomUUID()}`;

    const response = await POST(
      new Request(`http://x/api/skills/${bogusName}/rollback`, {
        method: "POST",
        headers: { cookie, "content-type": "application/json" },
        body: JSON.stringify({ version: "v1" }),
      }),
      { params: Promise.resolve({ name: bogusName }) },
    );

    expect(response.status).toBe(404);
    const body = await response.json();
    expect(body.error.code).toBe("SKILL_NOT_FOUND");
  });

  it("returns 404 SKILL_VERSION_NOT_FOUND for a nonexistent version", async () => {
    const seeded = await seedOrgWithAdmin(testDb.authDb);
    const name = `bad-version-${randomUUID()}`;
    await seedSkillWithTwoVersions(seeded, name);
    const cookie = await loginAndBuildCookie(testDb.authDb, seeded.adminEmail, seeded.adminPassword);
    const { POST } = route();

    const response = await POST(
      new Request(`http://x/api/skills/${name}/rollback`, {
        method: "POST",
        headers: { cookie, "content-type": "application/json" },
        body: JSON.stringify({ version: "v99" }),
      }),
      { params: Promise.resolve({ name }) },
    );

    expect(response.status).toBe(404);
    const body = await response.json();
    expect(body.error.code).toBe("SKILL_VERSION_NOT_FOUND");
  });

  it("returns 422 VALIDATION_FAILED for a missing version field", async () => {
    const seeded = await seedOrgWithAdmin(testDb.authDb);
    const name = `missing-version-body-${randomUUID()}`;
    await seedSkillWithTwoVersions(seeded, name);
    const cookie = await loginAndBuildCookie(testDb.authDb, seeded.adminEmail, seeded.adminPassword);
    const { POST } = route();

    const response = await POST(
      new Request(`http://x/api/skills/${name}/rollback`, {
        method: "POST",
        headers: { cookie, "content-type": "application/json" },
        body: JSON.stringify({}),
      }),
      { params: Promise.resolve({ name }) },
    );

    expect(response.status).toBe(422);
    const body = await response.json();
    expect(body.error.code).toBe("VALIDATION_FAILED");
  });

  it("returns 401 with no credential", async () => {
    const { POST } = route();
    const response = await POST(
      new Request("http://x/api/skills/anything/rollback", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ version: "v1" }),
      }),
      { params: Promise.resolve({ name: "anything" }) },
    );
    expect(response.status).toBe(401);
  });
});
