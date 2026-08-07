import { randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { getPromptUsageSummaryForOrganization } from "@/bcs/distribution";
import { createPrompt, publishVersion, startSkillChainRun, type ChainStep, type PromptActor } from "@/bcs/prompt-registry";
import { withTenantContext } from "@/shared/db";
import { startTestDb, type TestDb } from "@/shared/db/test-helpers";
import { withApiRoute } from "@/shared/api/handler";
import { loginAndBuildCookie, seedOrgWithAdmin, type SeededOrg } from "@/shared/api/test-helpers";
import { handlePost } from "./route";

describe("/api/chain-runs/[runId]/advance", () => {
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

  function actorFor(seeded: SeededOrg): PromptActor {
    return { organizationId: seeded.organizationId, userId: seeded.adminUserId };
  }

  async function startOneStepChainRun(seeded: SeededOrg): Promise<{ runId: string; stepVersionId: string; stepPromptId: string }> {
    const actor = actorFor(seeded);
    const chainName = `chain-${randomUUID()}`;
    const stepSkillName = `${chainName}-step`;
    return withTenantContext(testDb.appDb, seeded.organizationId, async (tx) => {
      await createPrompt(tx, actor, { organizationId: seeded.organizationId, name: stepSkillName });
      const stepVersion = await publishVersion(tx, actor, {
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
      return { runId: result.runId, stepVersionId: stepVersion.id, stepPromptId: stepVersion.promptId };
    });
  }

  async function usageSummary(organizationId: string) {
    return withTenantContext(testDb.appDb, organizationId, (tx) =>
      getPromptUsageSummaryForOrganization(tx, organizationId, {
        window: { from: new Date(0), to: new Date(Date.now() + 1000) },
      }),
    );
  }

  it("records the pending step's success outcome, completes a one-step run, and records usage", async () => {
    const seeded = await seedOrgWithAdmin(testDb.authDb);
    const cookie = await loginAndBuildCookie(testDb.authDb, seeded.adminEmail, seeded.adminPassword);
    const { runId, stepVersionId, stepPromptId } = await startOneStepChainRun(seeded);
    const POST = route();

    const response = await POST(
      new Request(`http://x/api/chain-runs/${runId}/advance`, {
        method: "POST",
        headers: { cookie, "content-type": "application/json" },
        body: JSON.stringify({ stepIndex: 0, status: "success", output: "done" }),
      }),
      { params: Promise.resolve({ runId }) },
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.done).toBe(true);

    const summary = await usageSummary(seeded.organizationId);
    expect(summary.totalInvocations).toBe(1);
    expect(summary.successCount).toBe(1);
    expect(summary.bySkill).toEqual([
      expect.objectContaining({ promptId: stepPromptId, promptVersionId: stepVersionId, promptVersion: "1.0.0" }),
    ]);
  });

  it("records an error step report as failed usage", async () => {
    const seeded = await seedOrgWithAdmin(testDb.authDb);
    const cookie = await loginAndBuildCookie(testDb.authDb, seeded.adminEmail, seeded.adminPassword);
    const { runId } = await startOneStepChainRun(seeded);
    const POST = route();

    const response = await POST(
      new Request(`http://x/api/chain-runs/${runId}/advance`, {
        method: "POST",
        headers: { cookie, "content-type": "application/json" },
        body: JSON.stringify({ stepIndex: 0, status: "error", error: "model failed" }),
      }),
      { params: Promise.resolve({ runId }) },
    );

    expect(response.status).toBe(200);
    const summary = await usageSummary(seeded.organizationId);
    expect(summary.totalInvocations).toBe(1);
    expect(summary.failureCount).toBe(1);
    expect(summary.byStatus).toEqual([{ statusCode: 500, runCount: 1 }]);
  });

  it("returns 409 CHAIN_RUN_STEP_CONFLICT for a stale stepIndex without recording usage", async () => {
    const seeded = await seedOrgWithAdmin(testDb.authDb);
    const cookie = await loginAndBuildCookie(testDb.authDb, seeded.adminEmail, seeded.adminPassword);
    const { runId } = await startOneStepChainRun(seeded);
    const POST = route();

    const response = await POST(
      new Request(`http://x/api/chain-runs/${runId}/advance`, {
        method: "POST",
        headers: { cookie, "content-type": "application/json" },
        body: JSON.stringify({ stepIndex: 5, status: "success" }),
      }),
      { params: Promise.resolve({ runId }) },
    );

    expect(response.status).toBe(409);
    const body = await response.json();
    expect(body.error.code).toBe("CHAIN_RUN_STEP_CONFLICT");
    expect((await usageSummary(seeded.organizationId)).totalInvocations).toBe(0);
  });

  it("returns 422 VALIDATION_FAILED for an invalid status value", async () => {
    const seeded = await seedOrgWithAdmin(testDb.authDb);
    const cookie = await loginAndBuildCookie(testDb.authDb, seeded.adminEmail, seeded.adminPassword);
    const { runId } = await startOneStepChainRun(seeded);
    const POST = route();

    const response = await POST(
      new Request(`http://x/api/chain-runs/${runId}/advance`, {
        method: "POST",
        headers: { cookie, "content-type": "application/json" },
        body: JSON.stringify({ stepIndex: 0, status: "bogus" }),
      }),
      { params: Promise.resolve({ runId }) },
    );

    expect(response.status).toBe(422);
  });

  it("returns 401 with no credential", async () => {
    const POST = route();
    const response = await POST(new Request("http://x/api/chain-runs/x/advance", { method: "POST" }), {
      params: Promise.resolve({ runId: "x" }),
    });
    expect(response.status).toBe(401);
  });
});
