import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { withTenantContext } from "@/shared/db/tenant-context";
import { startTestDb, type TestDb } from "@/shared/db/test-helpers";
import {
  ReportOutputTooLargeError,
  RunAlreadyFinishedError,
  RunNotFoundError,
  RunStepConflictError,
} from "../domain/skill-chain";
import { advanceSkillChainRun } from "./advance-skill-chain-run";
import {
  makeChainFixtureOrg,
  publishChain,
  publishThreeStepChain,
  queryChainRunRows,
  queryChainRunStepRows,
  type ChainFixtureOrg,
} from "./skill-chain-test-helpers";
import { startSkillChainRun } from "./start-skill-chain-run";

describe("advanceSkillChainRun", () => {
  let testDb: TestDb;

  beforeAll(async () => {
    testDb = await startTestDb();
  }, 120_000);

  afterAll(async () => {
    await testDb.teardown();
  });

  async function start(fixture: ChainFixtureOrg, promptName: string) {
    return withTenantContext(testDb.appDb, fixture.organizationId, (tx) =>
      startSkillChainRun(tx, fixture.actor, promptName),
    );
  }

  async function advance(
    fixture: ChainFixtureOrg,
    runId: string,
    report: Parameters<typeof advanceSkillChainRun>[3],
  ) {
    return withTenantContext(testDb.appDb, fixture.organizationId, (tx) =>
      advanceSkillChainRun(tx, fixture.actor, runId, report),
    );
  }

  it("drives a full 3-step chain to completion, each step resolving static content independent of prior reports (032-skill-file-format-refactor: no dependsOn auto-substitution)", async () => {
    const fixture = await makeChainFixtureOrg(testDb);
    const chain = await publishThreeStepChain(testDb, fixture, "full-run-chain");

    const started = await start(fixture, chain.promptName);
    if (!("step" in started)) throw new Error("expected a step, got done: true");
    expect(started.step.stepId).toBe("step1");
    expect(started.step.content).toBe("Step A output.");

    const afterStep1 = await advance(fixture, started.runId, {
      stepIndex: 0,
      status: "success",
      output: "OUTPUT_FROM_STEP_1",
    });
    if (!("step" in afterStep1)) throw new Error("expected a step, got done: true");
    expect(afterStep1.step.stepId).toBe("step2");
    expect(afterStep1.step.content).toBe("Step B content.");

    const afterStep2 = await advance(fixture, started.runId, {
      stepIndex: 1,
      status: "success",
      output: "OUTPUT_FROM_STEP_2",
    });
    if (!("step" in afterStep2)) throw new Error("expected a step, got done: true");
    expect(afterStep2.step.stepId).toBe("step3");
    expect(afterStep2.step.content).toBe("Step C content.");

    const afterStep3 = await advance(fixture, started.runId, {
      stepIndex: 2,
      status: "success",
      output: "OUTPUT_FROM_STEP_3",
    });
    expect(afterStep3).toEqual({ done: true });

    const runRows = await queryChainRunRows(testDb, sql`id = ${started.runId}`);
    expect(runRows[0]?.status).toBe("completed");

    // Each prior step's caller-reported output is still recorded and
    // queryable by the caller — it's just never auto-injected into a later
    // step's own content anymore.
    const stepRows = await queryChainRunStepRows(testDb, sql`run_id = ${started.runId}`);
    const byIndex = new Map(stepRows.map((r) => [r.step_index, r]));
    expect(byIndex.get(0)?.reported_output).toBe("OUTPUT_FROM_STEP_1");
    expect(byIndex.get(1)?.reported_output).toBe("OUTPUT_FROM_STEP_2");
  });

  it("marks the run failed when any step is reported as error, even after resolving every step", async () => {
    const fixture = await makeChainFixtureOrg(testDb);
    const chain = await publishThreeStepChain(testDb, fixture, "failure-isolation-chain");

    const started = await start(fixture, chain.promptName);
    if (!("step" in started)) throw new Error("expected a step");

    const afterStep1 = await advance(fixture, started.runId, {
      stepIndex: 0,
      status: "error",
      error: "boom",
    });
    if (!("step" in afterStep1)) throw new Error("expected a step");
    // step2 still resolves its own static content regardless of step1's
    // failure — a step's resolution is never gated on a prior step's report.
    expect(afterStep1.step.stepId).toBe("step2");
    expect(afterStep1.step.content).toBe("Step B content.");

    const afterStep2 = await advance(fixture, started.runId, {
      stepIndex: 1,
      status: "success",
      output: "step2 output",
    });
    if (!("step" in afterStep2)) throw new Error("expected a step");
    // The run continues resolving every remaining step regardless of the
    // earlier failure.
    expect(afterStep2.step.stepId).toBe("step3");

    const afterStep3 = await advance(fixture, started.runId, { stepIndex: 2, status: "success" });
    expect(afterStep3).toEqual({ done: true });

    const runRows = await queryChainRunRows(testDb, sql`id = ${started.runId}`);
    expect(runRows[0]?.status).toBe("failed");
  });

  it("rejects an oversized report output before any state changes, leaving the run fully resumable", async () => {
    const fixture = await makeChainFixtureOrg(testDb);
    const chain = await publishThreeStepChain(testDb, fixture, "oversized-output-chain");
    const started = await start(fixture, chain.promptName);
    if (!("step" in started)) throw new Error("expected a step");

    const oversized = "x".repeat(65537);
    await expect(
      advance(fixture, started.runId, { stepIndex: 0, status: "success", output: oversized }),
    ).rejects.toBeInstanceOf(ReportOutputTooLargeError);

    const runRows = await queryChainRunRows(testDb, sql`id = ${started.runId}`);
    expect(runRows[0]?.status).toBe("in_progress");
    expect(runRows[0]?.current_step_index).toBe(0);

    // Retry with a valid-sized output still works — nothing was lost.
    const retried = await advance(fixture, started.runId, {
      stepIndex: 0,
      status: "success",
      output: "small output",
    });
    expect("step" in retried).toBe(true);
  });

  it("rejects a report naming a step index the run has already moved past (FR-007a)", async () => {
    const fixture = await makeChainFixtureOrg(testDb);
    const chain = await publishThreeStepChain(testDb, fixture, "conflict-chain");
    const started = await start(fixture, chain.promptName);
    if (!("step" in started)) throw new Error("expected a step");

    await advance(fixture, started.runId, { stepIndex: 0, status: "success", output: "ok" });

    // A stale/duplicate report for step 0 again, after the run has already
    // moved to step 1 — must be rejected, never silently applied to step 1.
    await expect(
      advance(fixture, started.runId, { stepIndex: 0, status: "success", output: "stale retry" }),
    ).rejects.toBeInstanceOf(RunStepConflictError);
  });

  it("serializes two truly concurrent advance calls for the same run — exactly one succeeds, the run advances by exactly one step", async () => {
    const fixture = await makeChainFixtureOrg(testDb);
    const chain = await publishThreeStepChain(testDb, fixture, "true-race-chain");
    const started = await start(fixture, chain.promptName);
    if (!("runId" in started)) throw new Error("expected a runId");

    const results = await Promise.allSettled([
      advance(fixture, started.runId, { stepIndex: 0, status: "success", output: "racer A" }),
      advance(fixture, started.runId, { stepIndex: 0, status: "success", output: "racer B" }),
    ]);

    const fulfilled = results.filter((r) => r.status === "fulfilled");
    const rejected = results.filter((r) => r.status === "rejected");
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect((rejected[0] as PromiseRejectedResult).reason).toBeInstanceOf(RunStepConflictError);

    const runRows = await queryChainRunRows(testDb, sql`id = ${started.runId}`);
    expect(runRows[0]?.current_step_index).toBe(1);
  });

  it("rejects advancing a run that has already finished (FR-007b, SC-008)", async () => {
    const fixture = await makeChainFixtureOrg(testDb);
    await publishChain(testDb, fixture, { name: "already-done-chain", steps: [] });
    const started = await start(fixture, "already-done-chain");
    expect(started).toEqual({ runId: expect.any(String), done: true });

    await expect(
      advance(fixture, (started as { runId: string }).runId, { stepIndex: 0, status: "success" }),
    ).rejects.toBeInstanceOf(RunAlreadyFinishedError);
  });

  it("rejects advancing a run belonging to a different organization, same as a nonexistent run", async () => {
    const fixtureA = await makeChainFixtureOrg(testDb);
    const fixtureB = await makeChainFixtureOrg(testDb);
    const chain = await publishThreeStepChain(testDb, fixtureA, "cross-org-chain");
    const started = await start(fixtureA, chain.promptName);
    if (!("runId" in started)) throw new Error("expected a runId");

    await expect(
      advance(fixtureB, started.runId, { stepIndex: 0, status: "success" }),
    ).rejects.toBeInstanceOf(RunNotFoundError);
  });
});
