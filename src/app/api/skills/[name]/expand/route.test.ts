import { randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { getPromptUsageSummaryForOrganization } from "@/bcs/distribution";
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

  async function publishTemplateSkill(seeded: SeededOrg, name: string, userTemplate = "Topic: {{ topic }}") {
    const actor: PromptActor = { organizationId: seeded.organizationId, userId: seeded.adminUserId };
    return withTenantContext(testDb.appDb, seeded.organizationId, async (tx) => {
      await createPrompt(tx, actor, { organizationId: seeded.organizationId, name });
      return publishVersion(tx, actor, {
        organizationId: seeded.organizationId,
        promptName: name,
        version: "1.0.0",
        systemTemplate: "You are a helpful assistant.",
        userTemplate,
      });
    });
  }

  async function usageSummary(organizationId: string) {
    return withTenantContext(testDb.appDb, organizationId, (tx) =>
      getPromptUsageSummaryForOrganization(tx, organizationId, {
        window: { from: new Date(0), to: new Date(Date.now() + 1000) },
      }),
    );
  }

  it("expands a published template skill for the authenticated caller and records usage", async () => {
    const seeded = await seedOrgWithAdmin(testDb.authDb);
    const cookie = await loginAndBuildCookie(testDb.authDb, seeded.adminEmail, seeded.adminPassword);
    const name = `skill-${randomUUID()}`;
    const version = await publishTemplateSkill(seeded, name);
    const POST = route();

    const response = await POST(
      new Request(`http://x/api/skills/${name}/expand`, {
        method: "POST",
        headers: { cookie, "content-type": "application/json" },
        body: JSON.stringify({
          input: { topic: "onboarding" },
          gitRemoteUrl: "git@example.com:org/repo.git",
          gitBranch: "main",
          gitCommitSha: "abc123",
        }),
      }),
      { params: Promise.resolve({ name }) },
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.userMessage).toContain("onboarding");

    const summary = await usageSummary(seeded.organizationId);
    expect(summary.totalInvocations).toBe(1);
    expect(summary.bySkill).toEqual([
      expect.objectContaining({
        promptId: version.promptId,
        promptVersionId: version.id,
        promptVersion: "1.0.0",
        runCount: 1,
        successCount: 1,
      }),
    ]);
    expect(summary.averageLatencyMs).toEqual(expect.any(Number));
  });

  it("records failed telemetry when expansion fails after a visible version is resolved", async () => {
    const seeded = await seedOrgWithAdmin(testDb.authDb);
    const cookie = await loginAndBuildCookie(testDb.authDb, seeded.adminEmail, seeded.adminPassword);
    const name = `skill-${randomUUID()}`;
    await publishTemplateSkill(seeded, name, "Needs {{ not_supplied }}.");
    const POST = route();

    const response = await POST(
      new Request(`http://x/api/skills/${name}/expand`, {
        method: "POST",
        headers: { cookie, "content-type": "application/json" },
        body: JSON.stringify({ input: {} }),
      }),
      { params: Promise.resolve({ name }) },
    );

    expect(response.status).toBe(500);
    const summary = await usageSummary(seeded.organizationId);
    expect(summary.totalInvocations).toBe(1);
    expect(summary.failureCount).toBe(1);
    expect(summary.byStatus).toEqual([{ statusCode: 500, runCount: 1 }]);
  });

  it("returns 404 SKILL_EXPANSION_SOURCE_NOT_FOUND for a nonexistent skill without recording usage", async () => {
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
    expect((await usageSummary(seeded.organizationId)).totalInvocations).toBe(0);
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
