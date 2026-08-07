import { randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createPrompt, publishVersion, startSkillChainRun, type ChainStep, type PromptActor } from "@/bcs/prompt-registry";
import { withTenantContext } from "@/shared/db";
import { startTestDb, type TestDb } from "@/shared/db/test-helpers";
import { withApiRoute } from "@/shared/api/handler";
import { loginAndBuildCookie, seedOrgWithAdmin, type SeededOrg } from "@/shared/api/test-helpers";
import { handleGet } from "./route";

describe("/api/chain-runs/[runId]", () => {
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
    return withApiRoute(handleGet, { authDb: testDb.authDb, db: testDb.appDb });
  }

  function actorFor(seeded: SeededOrg): PromptActor {
    return { organizationId: seeded.organizationId, userId: seeded.adminUserId };
  }

  async function startOneStepChainRun(seeded: SeededOrg): Promise<string> {
    const actor = actorFor(seeded);
    const chainName = `chain-${randomUUID()}`;
    const stepSkillName = `${chainName}-step`;
    return withTenantContext(testDb.appDb, seeded.organizationId, async (tx) => {
      await createPrompt(tx, actor, { organizationId: seeded.organizationId, name: stepSkillName });
      await publishVersion(tx, actor, {
        organizationId: seeded.organizationId,
        promptName: stepSkillName,
        version: "1.0.0",
        mainFile: { content: "Step output." },
      });
      const steps: ChainStep[] = [{ id: "step1", promptName: stepSkillName, dependsOn: [] }];
      await createPrompt(tx, actor, { organizationId: seeded.organizationId, name: chainName });
      await publishVersion(tx, actor, {
        organizationId: seeded.organizationId,
        promptName: chainName,
        version: "1.0.0",
        steps,
      });
      const result = await startSkillChainRun(tx, actor, chainName);
      if (!("runId" in result)) {
        throw new Error("expected a runId");
      }
      return result.runId;
    });
  }

  it("reads a run's current state and step history", async () => {
    const seeded = await seedOrgWithAdmin(testDb.authDb);
    const cookie = await loginAndBuildCookie(testDb.authDb, seeded.adminEmail, seeded.adminPassword);
    const runId = await startOneStepChainRun(seeded);
    const GET = route();

    const response = await GET(new Request(`http://x/api/chain-runs/${runId}`, { headers: { cookie } }), {
      params: Promise.resolve({ runId }),
    });

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.run.id).toBe(runId);
    expect(body.steps).toHaveLength(1);
  });

  it("returns 404 CHAIN_RUN_NOT_FOUND for a nonexistent run", async () => {
    const seeded = await seedOrgWithAdmin(testDb.authDb);
    const cookie = await loginAndBuildCookie(testDb.authDb, seeded.adminEmail, seeded.adminPassword);
    const GET = route();
    const bogusId = randomUUID();

    const response = await GET(new Request(`http://x/api/chain-runs/${bogusId}`, { headers: { cookie } }), {
      params: Promise.resolve({ runId: bogusId }),
    });

    expect(response.status).toBe(404);
    const body = await response.json();
    expect(body.error.code).toBe("CHAIN_RUN_NOT_FOUND");
  });

  it("returns 404 CHAIN_RUN_NOT_FOUND for a run belonging to a different organization", async () => {
    const seededA = await seedOrgWithAdmin(testDb.authDb);
    const seededB = await seedOrgWithAdmin(testDb.authDb);
    const cookieA = await loginAndBuildCookie(testDb.authDb, seededA.adminEmail, seededA.adminPassword);
    const runIdB = await startOneStepChainRun(seededB);
    const GET = route();

    const response = await GET(new Request(`http://x/api/chain-runs/${runIdB}`, { headers: { cookie: cookieA } }), {
      params: Promise.resolve({ runId: runIdB }),
    });

    expect(response.status).toBe(404);
  });

  it("returns 401 with no credential", async () => {
    const GET = route();
    const response = await GET(new Request("http://x/api/chain-runs/x"), { params: Promise.resolve({ runId: "x" }) });
    expect(response.status).toBe(401);
  });
});
