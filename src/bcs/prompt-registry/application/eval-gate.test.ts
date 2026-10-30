import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import type { UserSummary } from "@/bcs/identity-access";
import { withTenantContext } from "@/shared/db/tenant-context";
import { startTestDb, type TestDb } from "@/shared/db/test-helpers";
import { EVAL_CASES_FILE_NAME } from "../domain/eval-cases";
import { EvalGateConfigInvalidError, VersionNotCandidateError, evaluateGate } from "../domain/eval-gate";
import { EvalsNotEnabledError, type EvalProviderPool } from "../domain/eval-run";
import { setEvalProviderPool } from "../infrastructure/eval-provider-pool";
import { activateCandidateVersion, getEvalGate, setEvalGate } from "./eval-gate";
import { executeEvalRun } from "./execute-eval-run";
import { createPromptInOrg, makePromptFixtureOrg, type PromptFixtureOrg } from "./prompt-test-helpers";
import { publishVersion } from "./publish-version";

const CASES = "cases:\n  - name: greets\n    input: say hello\n    assert:\n      - contains: hello\n";
const MODELS = ["stub/m1"];

describe("eval gate on activation", () => {
  let testDb: TestDb;
  beforeAll(async () => {
    testDb = await startTestDb();
  }, 120_000);
  afterAll(async () => {
    await testDb.teardown();
  });
  afterEach(() => setEvalProviderPool(null));

  const pool = (reply: string): EvalProviderPool => ({
    providers: [{ id: "stub", complete: async () => ({ text: reply, tokens: 1 }) }],
    models: MODELS,
  });
  const scope = (f: PromptFixtureOrg) => <T>(fn: Parameters<typeof withTenantContext<T>>[2]) =>
    withTenantContext(testDb.appDb, f.organizationId, fn);
  const user = (f: PromptFixtureOrg, id: string, role: "admin" | "member"): UserSummary => ({
    id,
    orgId: f.organizationId,
    teamId: f.teamId,
    role,
    email: `${id}@x.test`,
  });
  const publish = (f: PromptFixtureOrg, name: string, version: string) =>
    withTenantContext(testDb.appDb, f.organizationId, (tx) =>
      publishVersion(tx, f.actor, {
        organizationId: f.organizationId,
        promptName: name,
        version,
        mainFile: { content: `Be brief ${version}.` },
        supportingFiles: [{ name: EVAL_CASES_FILE_NAME, content: CASES }],
      }),
    );
  const activeLabel = async (f: PromptFixtureOrg, name: string) => {
    const [row] = await testDb.ownerDb.execute<{ version: string }>(
      sql`select v.version from prompt_registry.prompts p join prompt_registry.prompt_versions v on v.id = p.active_version_id
          where p.organization_id = ${f.organizationId} and p.name = ${name}`,
    );
    return row?.version;
  };
  const auditActions = async (f: PromptFixtureOrg) =>
    (
      await testDb.ownerDb.execute<{ action: string }>(
        sql`select action from audit.audit_events where organization_id = ${f.organizationId} order by created_at`,
      )
    ).map((r) => r.action);

  async function gatedSkill(optIn = true) {
    const f = await makePromptFixtureOrg(testDb);
    if (optIn) {
      await testDb.ownerDb.execute(
        sql`insert into prompt_registry.eval_settings (organization_id, enabled, updated_by) values (${f.organizationId}, true, ${f.actorUserId})`,
      );
    }
    const name = `gate-${randomUUID()}`;
    await createPromptInOrg(testDb, f, name);
    await publish(f, name, "1.0.0");
    return { f, name, admin: user(f, f.actorUserId, "admin") };
  }
  const enable = (f: PromptFixtureOrg, admin: UserSummary, name: string, minPassPct = 100) =>
    withTenantContext(testDb.appDb, f.organizationId, (tx) =>
      setEvalGate(tx, admin, name, { enabled: true, models: MODELS, minPassPct }),
    );

  it("refuses to enable without an opt-in or a pool; enables once both exist", async () => {
    const { f, name, admin } = await gatedSkill(false);
    setEvalProviderPool(pool("hello"));
    await expect(enable(f, admin, name)).rejects.toThrow(EvalsNotEnabledError);
    await testDb.ownerDb.execute(
      sql`insert into prompt_registry.eval_settings (organization_id, enabled, updated_by) values (${f.organizationId}, true, ${f.actorUserId})`,
    );
    setEvalProviderPool(null);
    await expect(enable(f, admin, name)).rejects.toThrow(/pool/i);
    setEvalProviderPool(pool("hello"));
    await expect(enable(f, admin, name)).resolves.toMatchObject({ enabled: true });
  });

  it("holds a new version as a candidate, then activates it when the gate run passes", async () => {
    const { f, name, admin } = await gatedSkill();
    setEvalProviderPool(pool("hello there"));
    await enable(f, admin, name);

    const published = (await publish(f, name, "1.1.0")) as { candidate?: boolean; gate?: { state: string; runId?: string } };
    expect(published.candidate).toBe(true);
    expect(published.gate?.state).toBe("evaluating");
    expect(await activeLabel(f, name)).toBe("1.0.0");
    const gate = await withTenantContext(testDb.appDb, f.organizationId, (tx) => getEvalGate(tx, f.organizationId, name));
    expect(gate.candidates).toEqual(["1.1.0"]);

    await executeEvalRun(scope(f), f.organizationId, published.gate!.runId!, pool("hello there"));
    expect(await activeLabel(f, name)).toBe("1.1.0");
    expect(await auditActions(f)).toEqual(expect.arrayContaining(["eval_gate.candidate_created", "eval_gate.passed", "prompt.version_activated"]));
  });

  it("keeps the previous version active and records why when the run misses the threshold", async () => {
    const { f, name, admin } = await gatedSkill();
    setEvalProviderPool(pool("nope"));
    await enable(f, admin, name);
    const published = (await publish(f, name, "1.1.0")) as { gate?: { runId?: string } };
    await executeEvalRun(scope(f), f.organizationId, published.gate!.runId!, pool("nope"));
    expect(await activeLabel(f, name)).toBe("1.0.0");
    expect(await auditActions(f)).toContain("eval_gate.failed");
  });

  it("leaves the candidate blocked, not active, when the pool disappears before publish", async () => {
    const { f, name, admin } = await gatedSkill();
    setEvalProviderPool(pool("hello"));
    await enable(f, admin, name);
    setEvalProviderPool(null);
    const published = (await publish(f, name, "1.1.0")) as { gate?: { state: string } };
    expect(published.gate?.state).toBe("blocked");
    expect(await activeLabel(f, name)).toBe("1.0.0");
    expect(await auditActions(f)).toContain("eval_gate.blocked");
  });

  it("with the gate off, publishing activates immediately as before", async () => {
    const { f, name } = await gatedSkill();
    await publish(f, name, "1.1.0");
    expect(await activeLabel(f, name)).toBe("1.1.0");
  });

  it("lets an admin or the owner override with a reason, and nobody else", async () => {
    const { f, name, admin } = await gatedSkill();
    setEvalProviderPool(pool("hello"));
    await enable(f, admin, name);
    await publish(f, name, "1.1.0");
    await publish(f, name, "1.2.0");
    const act = (u: UserSummary, v: string, reason: string) =>
      withTenantContext(testDb.appDb, f.organizationId, (tx) => activateCandidateVersion(tx, u, name, v, reason));

    await expect(act(user(f, f.otherUserId, "member"), "1.1.0", "why")).rejects.toThrow();
    await expect(act(user(f, f.actorUserId, "member"), "1.1.0", "  ")).rejects.toThrow(EvalGateConfigInvalidError);
    await expect(act(user(f, f.actorUserId, "member"), "1.1.0", "hotfix")).resolves.toEqual({ activeVersion: "1.1.0" });
    expect(await activeLabel(f, name)).toBe("1.1.0");
    await expect(act(admin, "1.1.0", "again")).rejects.toThrow(VersionNotCandidateError);
    expect(await auditActions(f)).toContain("eval_gate.overridden");
    const [ev] = await testDb.ownerDb.execute<{ after: { reason: string } }>(
      sql`select after from audit.audit_events where organization_id = ${f.organizationId} and action = 'eval_gate.overridden'`,
    );
    expect(ev?.after.reason).toBe("hotfix");
  });
});

describe("evaluateGate", () => {
  const gate = { enabled: true, models: ["a/x", "b/y"], minPassPct: 100 };
  it("passes only when every gate model meets the threshold", () => {
    const run = { status: "succeeded" as const, error: null, models: ["a/x", "b/y"] };
    expect(evaluateGate(gate, { ...run, results: [{ model: "a/x", passed: true }, { model: "b/y", passed: true }] }).passed).toBe(true);
    const bad = evaluateGate(gate, { ...run, results: [{ model: "a/x", passed: true }, { model: "b/y", passed: false }] });
    expect(bad.passed).toBe(false);
    expect(bad.reasons[0]).toContain("b/y");
    expect(evaluateGate({ ...gate, minPassPct: 50 }, { ...run, results: [{ model: "a/x", passed: true }, { model: "a/x", passed: false }, { model: "b/y", passed: true }] }).passed).toBe(true);
  });
  it("fails a missing model and a failed run", () => {
    expect(evaluateGate(gate, { status: "succeeded", error: null, models: ["a/x"], results: [{ model: "a/x", passed: true }] }).reasons).toEqual(["b/y was not evaluated."]);
    expect(evaluateGate(gate, { status: "failed", error: "timed out", models: [], results: [] }).reasons).toEqual(["timed out"]);
  });
});
