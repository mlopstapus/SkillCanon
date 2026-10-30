import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { withTenantContext } from "@/shared/db/tenant-context";
import { startTestDb, type TestDb } from "@/shared/db/test-helpers";
import { EVAL_CASES_FILE_NAME } from "../domain/eval-cases";
import { DEFAULT_EVAL_LIMITS, type EvalProviderPool } from "../domain/eval-run";
import { sealSecret } from "../infrastructure/secret-box";
import { evalWorkerTick, type EvalWorkerDeps } from "./eval-worker";
import { getEvalRun } from "./get-eval-run";
import { createPromptInOrg, makePromptFixtureOrg, type PromptFixtureOrg } from "./prompt-test-helpers";
import { publishVersion } from "./publish-version";
import { submitEvalRun } from "./submit-eval-run";

const CASES = "cases:\n  - name: greets\n    input: say hello\n    assert:\n      - contains: hello\n";

describe("eval worker", () => {
  let testDb: TestDb;
  beforeAll(async () => {
    testDb = await startTestDb();
  }, 120_000);
  afterAll(async () => {
    await testDb.teardown();
  });
  beforeEach(() => vi.stubEnv("JWT_SECRET", "a-real-signing-secret-for-tests"));
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  const deps = (): EvalWorkerDeps => ({
    db: testDb.appDb,
    inFlight: new Set(),
    scopeFor: (orgId) => (fn) => withTenantContext(testDb.appDb, orgId, fn),
  });

  async function queuedRun(withProvider: boolean) {
    const f = await makePromptFixtureOrg(testDb);
    await testDb.ownerDb.execute(
      sql`insert into prompt_registry.eval_settings (organization_id, enabled, updated_by) values (${f.organizationId}, true, ${f.actor.userId})`,
    );
    if (withProvider) {
      await testDb.ownerDb.execute(
        sql`insert into prompt_registry.eval_provider_configs (organization_id, provider, api_key_enc, models, updated_by)
            values (${f.organizationId}, 'anthropic', ${sealSecret("k")}, '["m1"]'::jsonb, ${f.actor.userId})`,
      );
    }
    const name = `w-${randomUUID()}`;
    await createPromptInOrg(testDb, f, name);
    await withTenantContext(testDb.appDb, f.organizationId, (tx) =>
      publishVersion(tx, f.actor, {
        organizationId: f.organizationId,
        promptName: name,
        version: "1.0.0",
        mainFile: { content: "Be brief." },
        supportingFiles: [{ name: EVAL_CASES_FILE_NAME, content: CASES }],
      }),
    );
    const pool: EvalProviderPool = { providers: [{ id: "x", complete: async () => ({ text: "", tokens: 0 }) }], models: ["anthropic/m1"] };
    const run = await withTenantContext(testDb.appDb, f.organizationId, (tx) =>
      submitEvalRun(tx, f.actor, { promptName: name, version: "1.0.0", models: ["anthropic/m1"] }, pool),
    );
    return { f, name, run };
  }

  const read = (f: PromptFixtureOrg, name: string, id: string) =>
    withTenantContext(testDb.appDb, f.organizationId, (tx) => getEvalRun(tx, f.actor, name, "1.0.0", id));

  it("picks a queued run up across orgs and executes it with the org's stored provider", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({ content: [{ type: "text", text: "hello there" }], usage: { input_tokens: 1, output_tokens: 1 } }))),
    );
    const a = await queuedRun(true);
    const b = await queuedRun(true);
    const d = deps();
    await Promise.all(await evalWorkerTick(d));
    for (const x of [a, b]) {
      const done = await read(x.f, x.name, x.run.id);
      expect(done.status).toBe("succeeded");
      expect(done.results[0]?.passed).toBe(true);
    }
    expect(d.inFlight.size).toBe(0);
  });

  it("starts no more than maxConcurrentJobs per tick", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ content: [{ type: "text", text: "hello" }] }))));
    await queuedRun(true);
    await queuedRun(true);
    const started = await evalWorkerTick({ ...deps(), limits: { ...DEFAULT_EVAL_LIMITS, maxConcurrentJobs: 1 } });
    expect(started).toHaveLength(1);
    await Promise.all(started);
  });

  it("fails a run when the org has no provider configured", async () => {
    const x = await queuedRun(false);
    await Promise.all(await evalWorkerTick(deps()));
    const done = await read(x.f, x.name, x.run.id);
    expect(done.status).toBe("failed");
    expect(done.error).toMatch(/provider/i);
  });

  it("fails a run stuck in running after its worker died", async () => {
    const x = await queuedRun(false);
    await testDb.ownerDb.execute(
      sql`update prompt_registry.eval_runs set status = 'running', started_at = now() - interval '1 hour' where id = ${x.run.id}`,
    );
    await evalWorkerTick(deps());
    const done = await read(x.f, x.name, x.run.id);
    expect(done.status).toBe("failed");
    expect(done.error).toMatch(/worker stopped/i);
  });
});
