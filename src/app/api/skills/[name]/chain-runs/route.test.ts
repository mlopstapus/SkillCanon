import { randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createPrompt, publishVersion, type ChainStep, type PromptActor } from "@/bcs/prompt-registry";
import { withTenantContext } from "@/shared/db";
import { startTestDb, type TestDb } from "@/shared/db/test-helpers";
import { withApiRoute } from "@/shared/api/handler";
import { loginAndBuildCookie, seedOrgWithAdmin, type SeededOrg } from "@/shared/api/test-helpers";
import { handleGet, handlePost } from "./route";

describe("/api/skills/[name]/chain-runs", () => {
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
    return { POST: withApiRoute(handlePost, deps), GET: withApiRoute(handleGet, deps) };
  }

  function actorFor(seeded: SeededOrg): PromptActor {
    return { organizationId: seeded.organizationId, userId: seeded.adminUserId };
  }

  async function publishOneStepChain(seeded: SeededOrg, chainName: string) {
    const actor = actorFor(seeded);
    const stepSkillName = `${chainName}-step`;
    await withTenantContext(testDb.appDb, seeded.organizationId, async (tx) => {
      await createPrompt(tx, actor, { organizationId: seeded.organizationId, name: stepSkillName });
      await publishVersion(tx, actor, {
        organizationId: seeded.organizationId,
        promptName: stepSkillName,
        version: "1.0.0",
        userTemplate: "Step output.",
      });
      const steps: ChainStep[] = [{ id: "step1", promptName: stepSkillName, dependsOn: [] }];
      await createPrompt(tx, actor, { organizationId: seeded.organizationId, name: chainName });
      await publishVersion(tx, actor, {
        organizationId: seeded.organizationId,
        promptName: chainName,
        version: "1.0.0",
        steps,
      });
    });
  }

  it("starts a chain run and returns the first step", async () => {
    const seeded = await seedOrgWithAdmin(testDb.authDb);
    const cookie = await loginAndBuildCookie(testDb.authDb, seeded.adminEmail, seeded.adminPassword);
    const chainName = `chain-${randomUUID()}`;
    await publishOneStepChain(seeded, chainName);
    const { POST } = route();

    const response = await POST(
      new Request(`http://x/api/skills/${chainName}/chain-runs`, {
        method: "POST",
        headers: { cookie, "content-type": "application/json" },
        body: JSON.stringify({}),
      }),
      { params: Promise.resolve({ name: chainName }) },
    );

    expect(response.status).toBe(201);
    const body = await response.json();
    expect(body.runId).toBeTypeOf("string");
    expect(body.step.stepIndex).toBe(0);
  });

  it("lists runs for a chain skill", async () => {
    const seeded = await seedOrgWithAdmin(testDb.authDb);
    const cookie = await loginAndBuildCookie(testDb.authDb, seeded.adminEmail, seeded.adminPassword);
    const chainName = `chain-${randomUUID()}`;
    await publishOneStepChain(seeded, chainName);
    const { POST, GET } = route();

    await POST(
      new Request(`http://x/api/skills/${chainName}/chain-runs`, {
        method: "POST",
        headers: { cookie, "content-type": "application/json" },
        body: JSON.stringify({}),
      }),
      { params: Promise.resolve({ name: chainName }) },
    );

    const response = await GET(new Request(`http://x/api/skills/${chainName}/chain-runs`, { headers: { cookie } }), {
      params: Promise.resolve({ name: chainName }),
    });

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.items).toHaveLength(1);
    expect(body.page).toBe(1);
    expect(body.total).toBe(1);
  });

  it("returns 404 SKILL_NOT_FOUND for a nonexistent skill", async () => {
    const seeded = await seedOrgWithAdmin(testDb.authDb);
    const cookie = await loginAndBuildCookie(testDb.authDb, seeded.adminEmail, seeded.adminPassword);
    const { POST } = route();

    const response = await POST(
      new Request("http://x/api/skills/does-not-exist/chain-runs", {
        method: "POST",
        headers: { cookie, "content-type": "application/json" },
        body: JSON.stringify({}),
      }),
      { params: Promise.resolve({ name: "does-not-exist" }) },
    );

    expect(response.status).toBe(404);
    const body = await response.json();
    expect(body.error.code).toBe("SKILL_NOT_FOUND");
  });

  it("returns 401 with no credential", async () => {
    const { GET } = route();
    const response = await GET(new Request("http://x/api/skills/x/chain-runs"), {
      params: Promise.resolve({ name: "x" }),
    });
    expect(response.status).toBe(401);
  });
});
