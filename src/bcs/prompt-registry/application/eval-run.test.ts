import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { withTenantContext } from "@/shared/db/tenant-context";
import { startTestDb, type TestDb } from "@/shared/db/test-helpers";
import { EVAL_CASES_FILE_NAME } from "../domain/eval-cases";
import {
  EvalCasesNotFoundError,
  EvalJudgeRequiredError,
  EvalModelNotAllowedError,
  EvalsNotEnabledError,
  EvalPoolNotConfiguredError,
  DEFAULT_EVAL_LIMITS,
  type EvalProvider,
  type EvalProviderPool,
} from "../domain/eval-run";
import { executeEvalRun } from "./execute-eval-run";
import { getEvalsEnabled, setEvalsEnabled } from "./eval-settings";
import { getEvalRun } from "./get-eval-run";
import { createPromptInOrg, makePromptFixtureOrg, type PromptFixtureOrg } from "./prompt-test-helpers";
import { publishVersion } from "./publish-version";
import { submitEvalRun } from "./submit-eval-run";

const ASSERT_CASES = `cases:
  - name: greets
    input: say hello
    assert:
      - contains: hello
  - name: fails
    input: say bye
    assert:
      - contains: hello
`;
const RUBRIC_CASES = `cases:
  - name: polite
    input: say hello
    rubric: Is it polite?
`;

function stubProvider(reply: (user: string, system: string) => string, tokens = 10): EvalProvider {
  return { id: "stub", complete: async ({ user, system }) => ({ text: reply(user, system), tokens }) };
}
const pool = (provider: EvalProvider, defaultJudge?: string): EvalProviderPool => ({
  providers: [provider],
  models: ["stub/m1", "stub/judge"],
  defaultJudge,
});

describe("central eval runs", () => {
  let testDb: TestDb;
  beforeAll(async () => {
    testDb = await startTestDb();
  }, 120_000);
  afterAll(async () => {
    await testDb.teardown();
  });

  const scope = (f: PromptFixtureOrg) => <T>(fn: Parameters<typeof withTenantContext<T>>[2]) =>
    withTenantContext(testDb.appDb, f.organizationId, fn);

  async function skillWithCases(cases?: string, optIn = true) {
    const f = await makePromptFixtureOrg(testDb);
    if (optIn) {
      await testDb.ownerDb.execute(
        sql`insert into prompt_registry.eval_settings (organization_id, enabled, updated_by) values (${f.organizationId}, true, ${f.actor.userId})`,
      );
    }
    const name = `ev-${randomUUID()}`;
    await createPromptInOrg(testDb, f, name);
    await withTenantContext(testDb.appDb, f.organizationId, (tx) =>
      publishVersion(tx, f.actor, {
        organizationId: f.organizationId,
        promptName: name,
        version: "1.0.0",
        mainFile: { content: "Be brief." },
        supportingFiles: cases ? [{ name: EVAL_CASES_FILE_NAME, content: cases }] : [],
      }),
    );
    return { f, name };
  }

  const submit = (f: PromptFixtureOrg, name: string, p: EvalProviderPool, models = ["stub/m1"], judge?: string) =>
    withTenantContext(testDb.appDb, f.organizationId, (tx) =>
      submitEvalRun(tx, f.actor, { promptName: name, version: "1.0.0", models, judge }, p),
    );

  it("runs queued -> succeeded with one result per case x model, keyed by digest", async () => {
    const { f, name } = await skillWithCases(ASSERT_CASES);
    const p = pool(stubProvider((user) => (user.includes("hello") ? "hello there" : "nope")));
    const run = await submit(f, name, p);
    expect(run.status).toBe("queued");
    expect(run.contentDigest).toMatch(/^[0-9a-f]{64}$/);

    await executeEvalRun(scope(f), f.organizationId, run.id, p);
    const done = await withTenantContext(testDb.appDb, f.organizationId, (tx) =>
      getEvalRun(tx, f.actor, name, "1.0.0", run.id),
    );
    expect(done.status).toBe("succeeded");
    expect(done.results.map((r) => [r.caseId, r.passed, r.scorePct])).toEqual([
      ["fails", false, 0],
      ["greets", true, 100],
    ]);
  });

  it("sends the governed skill content as the system message", async () => {
    const { f, name } = await skillWithCases(ASSERT_CASES);
    let seenSystem = "";
    const p = pool(stubProvider((_u, system) => ((seenSystem = system), "hello")));
    const run = await submit(f, name, p);
    await executeEvalRun(scope(f), f.organizationId, run.id, p);
    expect(seenSystem).toContain("Be brief.");
  });

  it("scores a rubric case with the judge", async () => {
    const { f, name } = await skillWithCases(RUBRIC_CASES);
    const p = pool(
      {
        id: "stub",
        complete: async ({ model }) =>
          model === "judge" ? { text: '{"score": 0.9, "reason": "ok"}', tokens: 5 } : { text: "hi", tokens: 5 },
      },
      "stub/judge",
    );
    const run = await submit(f, name, p);
    expect(run.judge).toBe("stub/judge");
    await executeEvalRun(scope(f), f.organizationId, run.id, p);
    const done = await withTenantContext(testDb.appDb, f.organizationId, (tx) =>
      getEvalRun(tx, f.actor, name, "1.0.0", run.id),
    );
    expect(done.results[0]).toMatchObject({ passed: true, scorePct: 90, tokens: 10 });
  });

  it("records a provider error on its own row and still succeeds", async () => {
    const { f, name } = await skillWithCases(ASSERT_CASES);
    let n = 0;
    const p = pool({
      id: "stub",
      complete: async () => {
        if (++n === 1) throw new Error("boom");
        return { text: "hello", tokens: 1 };
      },
    });
    const run = await submit(f, name, p);
    await executeEvalRun(scope(f), f.organizationId, run.id, p);
    const done = await withTenantContext(testDb.appDb, f.organizationId, (tx) =>
      getEvalRun(tx, f.actor, name, "1.0.0", run.id),
    );
    expect(done.status).toBe("succeeded");
    expect(done.results.find((r) => r.error)?.error).toBe("boom");
    expect(done.results.filter((r) => !r.error)).toHaveLength(1);
  });

  it("fails the run at the token cap, keeping partial results", async () => {
    const { f, name } = await skillWithCases(ASSERT_CASES);
    const p = pool(stubProvider(() => "hello", 500));
    const run = await submit(f, name, p);
    await executeEvalRun(scope(f), f.organizationId, run.id, p, { ...DEFAULT_EVAL_LIMITS, maxJobTokens: 100 });
    const done = await withTenantContext(testDb.appDb, f.organizationId, (tx) =>
      getEvalRun(tx, f.actor, name, "1.0.0", run.id),
    );
    expect(done.status).toBe("failed");
    expect(done.error).toMatch(/token limit/);
    expect(done.results).toHaveLength(1);
  });

  it("executes a run claimed twice only once", async () => {
    const { f, name } = await skillWithCases(ASSERT_CASES);
    let calls = 0;
    const p = pool(stubProvider(() => (calls++, "hello")));
    const run = await submit(f, name, p);
    await Promise.all([
      executeEvalRun(scope(f), f.organizationId, run.id, p),
      executeEvalRun(scope(f), f.organizationId, run.id, p),
    ]);
    expect(calls).toBe(2); // two cases, one execution
  });

  it("rejects an empty pool, an unknown model, missing cases and a missing judge, storing nothing", async () => {
    const { f, name } = await skillWithCases(ASSERT_CASES);
    const p = pool(stubProvider(() => "x"));
    await expect(submit(f, name, { providers: [], models: [] })).rejects.toBeInstanceOf(EvalPoolNotConfiguredError);
    await expect(submit(f, name, p, ["stub/other"])).rejects.toBeInstanceOf(EvalModelNotAllowedError);
    const none = await skillWithCases();
    await expect(submit(none.f, none.name, p)).rejects.toBeInstanceOf(EvalCasesNotFoundError);
    const rubric = await skillWithCases(RUBRIC_CASES);
    await expect(submit(rubric.f, rubric.name, p)).rejects.toBeInstanceOf(EvalJudgeRequiredError);
  });

  it("rejects a submit from an organization that has not opted in", async () => {
    const { f, name } = await skillWithCases(ASSERT_CASES, false);
    await expect(submit(f, name, pool(stubProvider(() => "x")))).rejects.toBeInstanceOf(EvalsNotEnabledError);
  });

  it("lets only an admin change the opt-in", async () => {
    const f = await makePromptFixtureOrg(testDb);
    const user = (role: "admin" | "member") =>
      ({ id: f.actor.userId, orgId: f.organizationId, role }) as unknown as Parameters<typeof setEvalsEnabled>[1];
    await expect(
      withTenantContext(testDb.appDb, f.organizationId, (tx) => setEvalsEnabled(tx, user("member"), true)),
    ).rejects.toThrow();
    await withTenantContext(testDb.appDb, f.organizationId, (tx) => setEvalsEnabled(tx, user("admin"), true));
    expect(await withTenantContext(testDb.appDb, f.organizationId, (tx) => getEvalsEnabled(tx, f.organizationId))).toBe(true);
  });

  it("hides another organization's run as not found", async () => {
    const { f, name } = await skillWithCases(ASSERT_CASES);
    const p = pool(stubProvider(() => "hello"));
    const run = await submit(f, name, p);
    const other = await makePromptFixtureOrg(testDb);
    await createPromptInOrg(testDb, other, name);
    await expect(
      withTenantContext(testDb.appDb, other.organizationId, (tx) =>
        getEvalRun(tx, other.actor, name, "1.0.0", run.id),
      ),
    ).rejects.toThrow();
  });
});
