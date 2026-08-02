import { randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createPrompt, publishVersion, type PromptActor } from "@/bcs/prompt-registry";
import { withTenantContext } from "@/shared/db";
import { startTestDb, type TestDb } from "@/shared/db/test-helpers";
import { withApiRoute } from "@/shared/api/handler";
import { loginAndBuildCookie, seedOrgWithAdmin, type SeededOrg } from "@/shared/api/test-helpers";
import { handlePost } from "./route";

describe("/api/skills/[name]/expand", () => {
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

  async function publishTemplateSkill(seeded: SeededOrg, name: string) {
    const actor: PromptActor = { organizationId: seeded.organizationId, userId: seeded.adminUserId };
    await withTenantContext(testDb.appDb, seeded.organizationId, async (tx) => {
      await createPrompt(tx, actor, { organizationId: seeded.organizationId, name });
      await publishVersion(tx, actor, {
        organizationId: seeded.organizationId,
        promptName: name,
        version: "1.0.0",
        systemTemplate: "You are a helpful assistant.",
        userTemplate: "Topic: {{ topic }}",
      });
    });
  }

  it("expands a published template skill for the authenticated caller", async () => {
    const seeded = await seedOrgWithAdmin(testDb.authDb);
    const cookie = await loginAndBuildCookie(testDb.authDb, seeded.adminEmail, seeded.adminPassword);
    const name = `skill-${randomUUID()}`;
    await publishTemplateSkill(seeded, name);
    const POST = route();

    const response = await POST(
      new Request(`http://x/api/skills/${name}/expand`, {
        method: "POST",
        headers: { cookie, "content-type": "application/json" },
        body: JSON.stringify({ input: { topic: "onboarding" } }),
      }),
      { params: Promise.resolve({ name }) },
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.userMessage).toContain("onboarding");
  });

  it("returns 404 SKILL_EXPANSION_SOURCE_NOT_FOUND for a nonexistent skill", async () => {
    const seeded = await seedOrgWithAdmin(testDb.authDb);
    const cookie = await loginAndBuildCookie(testDb.authDb, seeded.adminEmail, seeded.adminPassword);
    const POST = route();

    const response = await POST(
      new Request("http://x/api/skills/does-not-exist/expand", {
        method: "POST",
        headers: { cookie, "content-type": "application/json" },
        body: JSON.stringify({ input: {} }),
      }),
      { params: Promise.resolve({ name: "does-not-exist" }) },
    );

    expect(response.status).toBe(404);
    const body = await response.json();
    expect(body.error.code).toBe("SKILL_EXPANSION_SOURCE_NOT_FOUND");
  });

  it("returns 401 with no credential", async () => {
    const POST = route();
    const response = await POST(
      new Request("http://x/api/skills/x/expand", { method: "POST" }),
      { params: Promise.resolve({ name: "x" }) },
    );
    expect(response.status).toBe(401);
  });

  it("returns 422 VALIDATION_FAILED when input is missing", async () => {
    const seeded = await seedOrgWithAdmin(testDb.authDb);
    const cookie = await loginAndBuildCookie(testDb.authDb, seeded.adminEmail, seeded.adminPassword);
    const POST = route();

    const response = await POST(
      new Request("http://x/api/skills/x/expand", {
        method: "POST",
        headers: { cookie, "content-type": "application/json" },
        body: JSON.stringify({}),
      }),
      { params: Promise.resolve({ name: "x" }) },
    );

    expect(response.status).toBe(422);
  });
});
