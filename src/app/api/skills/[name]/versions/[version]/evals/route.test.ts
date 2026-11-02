import { randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createPrompt, publishVersion, setEvalProviderPool } from "@/bcs/prompt-registry";
import { withTenantContext } from "@/shared/db";
import { startTestDb, type TestDb } from "@/shared/db/test-helpers";
import { withApiRoute } from "@/shared/api/handler";
import { createApiKeyAndBuildAuthHeader, loginAndBuildCookie, seedOrgWithAdmin } from "@/shared/api/test-helpers";
import { handleGet, handlePost } from "./route";
import { handleGet as handleGetRun } from "./[runId]/route";
import { handlePut as handlePutSettings } from "../../../../../evals/settings/route";

describe("/api/skills/[name]/versions/[version]/evals", () => {
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
    setEvalProviderPool(null);
  });

  const deps = () => ({ authDb: testDb.authDb, db: testDb.appDb });

  async function seed(cases: string | null, optIn = true) {
    const seeded = await seedOrgWithAdmin(testDb.authDb);
    const name = `evals-${randomUUID()}`;
    await withTenantContext(testDb.appDb, seeded.organizationId, async (tx) => {
      const actor = { organizationId: seeded.organizationId, userId: seeded.adminUserId };
      await createPrompt(tx, actor, { organizationId: seeded.organizationId, name });
      await publishVersion(tx, actor, {
        organizationId: seeded.organizationId,
        promptName: name,
        version: "1.0.0",
        mainFile: { content: "Be brief." },
        supportingFiles: cases ? [{ name: "evals/cases.yaml", content: cases }] : [],
      });
    });
    const cookie = await loginAndBuildCookie(testDb.authDb, seeded.adminEmail, seeded.adminPassword);
    if (optIn) {
      const res = await withApiRoute(handlePutSettings, deps())(
        new Request("http://x/api/evals/settings", {
          method: "PUT",
          headers: { cookie, "content-type": "application/json" },
          body: JSON.stringify({ enabled: true }),
        }),
        { params: Promise.resolve({}) },
      );
      expect(res.status).toBe(200);
    }
    return { name, cookie, seeded };
  }

  const submit = (name: string, cookie: string, body: unknown) =>
    withApiRoute(handlePost, deps())(
      new Request(`http://x/api/skills/${name}/versions/1.0.0/evals`, {
        method: "POST",
        headers: { cookie, "content-type": "application/json" },
        body: JSON.stringify(body),
      }),
      { params: Promise.resolve({ name, version: "1.0.0" }) },
    );

  it("returns 409 EVALS_NOT_CONFIGURED with no provider pool", async () => {
    const { name, cookie } = await seed("cases:\n  - input: a\n    assert: [{contains: a}]\n");
    const res = await submit(name, cookie, { models: ["stub/m1"] });
    expect(res.status).toBe(409);
    expect((await res.json()).error.code).toBe("EVALS_NOT_CONFIGURED");
  });

  it("returns 409 EVALS_NOT_ENABLED before the org opts in", async () => {
    setEvalProviderPool({ providers: [{ id: "stub", complete: async () => ({ text: "", tokens: 0 }) }], models: ["stub/m1"] });
    const { name, cookie } = await seed("cases:\n  - input: a\n    assert: [{contains: a}]\n", false);
    const res = await submit(name, cookie, { models: ["stub/m1"] });
    expect(res.status).toBe(409);
    expect((await res.json()).error.code).toBe("EVALS_NOT_ENABLED");
  });

  it("submits (202) as a queued job and serves its status", async () => {
    setEvalProviderPool({
      providers: [{ id: "stub", complete: async () => ({ text: "alpha", tokens: 3 }) }],
      models: ["stub/m1"],
    });
    const { name, cookie } = await seed("cases:\n  - input: say it\n    assert: [{contains: alpha}]\n");
    const res = await submit(name, cookie, { models: ["stub/m1"] });
    expect(res.status).toBe(202);
    const run = await res.json();
    expect(run.status).toBe("queued"); // a separate worker picks it up

    const get = await withApiRoute(handleGetRun, deps())(
      new Request("http://x", { headers: { cookie } }),
      { params: Promise.resolve({ name, version: "1.0.0", runId: run.id }) },
    );
    expect((await get.json())).toMatchObject({ id: run.id, status: "queued", results: [] });

    const list = await withApiRoute(handleGet, deps())(
      new Request("http://x", { headers: { cookie } }),
      { params: Promise.resolve({ name, version: "1.0.0" }) },
    );
    expect((await list.json()).map((r: { id: string }) => r.id)).toEqual([run.id]);
  });

  it("returns 422 for a model outside the pool", async () => {
    setEvalProviderPool({ providers: [{ id: "stub", complete: async () => ({ text: "", tokens: 0 }) }], models: ["stub/m1"] });
    const { name, cookie } = await seed("cases:\n  - input: a\n    assert: [{contains: a}]\n");
    const res = await submit(name, cookie, { models: ["stub/other"] });
    expect(res.status).toBe(422);
    expect((await res.json()).error.code).toBe("EVAL_MODEL_NOT_ALLOWED");
  });

  it("enforces API-key scopes: evals:run submits, other scopes get 403, session unaffected", async () => {
    setEvalProviderPool({ providers: [{ id: "stub", complete: async () => ({ text: "", tokens: 0 }) }], models: ["stub/m1"] });
    const { name, seeded } = await seed("cases:\n  - input: a\n    assert: [{contains: a}]\n");
    const user = { id: seeded.adminUserId, orgId: seeded.organizationId, teamId: seeded.teamId, role: "admin" as const, email: seeded.adminEmail };
    const key = (scopes: string[]) =>
      withTenantContext(testDb.appDb, seeded.organizationId, (tx) => createApiKeyAndBuildAuthHeader(tx, user, `k-${randomUUID()}`, scopes));
    const post = (authorization: string) =>
      withApiRoute(handlePost, deps())(
        new Request("http://x", { method: "POST", headers: { authorization, "content-type": "application/json" }, body: JSON.stringify({ models: ["stub/m1"] }) }),
        { params: Promise.resolve({ name, version: "1.0.0" }) },
      );
    expect((await post(await key(["prompts:read"]))).status).toBe(403);
    expect((await post(await key(["evals:read"]))).status).toBe(403);
    expect((await post(await key(["evals:run"]))).status).toBe(202);
  });
});
