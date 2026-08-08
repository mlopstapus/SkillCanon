import { randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createPrompt } from "@/bcs/prompt-registry";
import { withTenantContext } from "@/shared/db";
import { startTestDb, type TestDb } from "@/shared/db/test-helpers";
import { withApiRoute } from "@/shared/api/handler";
import { loginAndBuildCookie, seedOrgWithAdmin, type SeededOrg } from "@/shared/api/test-helpers";
import { handleGet, handlePost } from "./route";

describe("/api/skills/[name]/versions", () => {
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

  it("publishes a template version and returns 201", async () => {
    const seeded = await seedOrgWithAdmin(testDb.authDb);
    const name = `greeter-${randomUUID()}`;
    await seedSkill(seeded, name);
    const cookie = await loginAndBuildCookie(testDb.authDb, seeded.adminEmail, seeded.adminPassword);
    const { POST } = route();

    const response = await POST(
      new Request(`http://x/api/skills/${name}/versions`, {
        method: "POST",
        headers: { cookie, "content-type": "application/json" },
        body: JSON.stringify({
          version: "v1",
          mainFile: { content: "You are a helpful assistant." },
        }),
      }),
      { params: Promise.resolve({ name }) },
    );

    expect(response.status).toBe(201);
    const body = await response.json();
    expect(body.version).toBe("v1");
    expect(body.kind).toBe("template");
  });

  it("returns 422 VALIDATION_FAILED for a missing version label", async () => {
    const seeded = await seedOrgWithAdmin(testDb.authDb);
    const name = `no-version-${randomUUID()}`;
    await seedSkill(seeded, name);
    const cookie = await loginAndBuildCookie(testDb.authDb, seeded.adminEmail, seeded.adminPassword);
    const { POST } = route();

    const response = await POST(
      new Request(`http://x/api/skills/${name}/versions`, {
        method: "POST",
        headers: { cookie, "content-type": "application/json" },
        body: JSON.stringify({ mainFile: { content: "hi" } }),
      }),
      { params: Promise.resolve({ name }) },
    );

    expect(response.status).toBe(422);
    const body = await response.json();
    expect(body.error.code).toBe("VALIDATION_FAILED");
  });

  it("returns 422 INVALID_SKILL_VERSION_SHAPE for neither template content nor steps", async () => {
    const seeded = await seedOrgWithAdmin(testDb.authDb);
    const name = `empty-shape-${randomUUID()}`;
    await seedSkill(seeded, name);
    const cookie = await loginAndBuildCookie(testDb.authDb, seeded.adminEmail, seeded.adminPassword);
    const { POST } = route();

    const response = await POST(
      new Request(`http://x/api/skills/${name}/versions`, {
        method: "POST",
        headers: { cookie, "content-type": "application/json" },
        body: JSON.stringify({ version: "v1" }),
      }),
      { params: Promise.resolve({ name }) },
    );

    expect(response.status).toBe(422);
    const body = await response.json();
    expect(body.error.code).toBe("INVALID_SKILL_VERSION_SHAPE");
  });

  it("returns 404 SKILL_NOT_FOUND publishing to a nonexistent skill", async () => {
    const seeded = await seedOrgWithAdmin(testDb.authDb);
    const cookie = await loginAndBuildCookie(testDb.authDb, seeded.adminEmail, seeded.adminPassword);
    const { POST } = route();
    const bogusName = `bogus-${randomUUID()}`;

    const response = await POST(
      new Request(`http://x/api/skills/${bogusName}/versions`, {
        method: "POST",
        headers: { cookie, "content-type": "application/json" },
        body: JSON.stringify({ version: "v1", mainFile: { content: "hi" } }),
      }),
      { params: Promise.resolve({ name: bogusName }) },
    );

    expect(response.status).toBe(404);
    const body = await response.json();
    expect(body.error.code).toBe("SKILL_NOT_FOUND");
  });

  it("lists versions for a skill", async () => {
    const seeded = await seedOrgWithAdmin(testDb.authDb);
    const name = `versioned-${randomUUID()}`;
    await seedSkill(seeded, name);
    const cookie = await loginAndBuildCookie(testDb.authDb, seeded.adminEmail, seeded.adminPassword);
    const { POST, GET } = route();

    await POST(
      new Request(`http://x/api/skills/${name}/versions`, {
        method: "POST",
        headers: { cookie, "content-type": "application/json" },
        body: JSON.stringify({ version: "v1", mainFile: { content: "content" } }),
      }),
      { params: Promise.resolve({ name }) },
    );

    const response = await GET(new Request(`http://x/api/skills/${name}/versions`, { headers: { cookie } }), {
      params: Promise.resolve({ name }),
    });

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toHaveLength(1);
    expect(body[0].version).toBe("v1");
  });

  it("returns 404 SKILL_NOT_FOUND listing versions for a nonexistent skill", async () => {
    const seeded = await seedOrgWithAdmin(testDb.authDb);
    const cookie = await loginAndBuildCookie(testDb.authDb, seeded.adminEmail, seeded.adminPassword);
    const { GET } = route();
    const bogusName = `bogus-${randomUUID()}`;

    const response = await GET(new Request(`http://x/api/skills/${bogusName}/versions`, { headers: { cookie } }), {
      params: Promise.resolve({ name: bogusName }),
    });

    expect(response.status).toBe(404);
    const body = await response.json();
    expect(body.error.code).toBe("SKILL_NOT_FOUND");
  });

  it("returns 401 with no credential", async () => {
    const { GET } = route();
    const response = await GET(new Request("http://x/api/skills/anything/versions"), {
      params: Promise.resolve({ name: "anything" }),
    });
    expect(response.status).toBe(401);
  });
});
