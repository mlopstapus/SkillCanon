import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createPrompt, publishVersion } from "@/bcs/prompt-registry";
import { withTenantContext } from "@/shared/db";
import { startTestDb, type TestDb } from "@/shared/db/test-helpers";
import { withApiRoute } from "@/shared/api/handler";
import { loginAndBuildCookie, seedOrgWithAdmin } from "@/shared/api/test-helpers";
import { handleDelete, handleGet, handlePatch, handlePut } from "./route";
import { handlePost as submitRun } from "../../skills/[name]/versions/[version]/evals/route";
import { handlePut as putSettings } from "../settings/route";

describe("/api/evals/providers", () => {
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
  afterEach(() => vi.unstubAllEnvs());

  const deps = () => ({ authDb: testDb.authDb, db: testDb.appDb });
  const call = (h: Parameters<typeof withApiRoute>[0], cookie: string, method: string, body?: unknown) =>
    withApiRoute(h, deps())(
      new Request("http://x/api/evals/providers", {
        method,
        headers: { cookie, "content-type": "application/json" },
        body: body === undefined ? undefined : JSON.stringify(body),
      }),
      { params: Promise.resolve({}) },
    );

  async function admin() {
    const seeded = await seedOrgWithAdmin(testDb.authDb);
    const cookie = await loginAndBuildCookie(testDb.authDb, seeded.adminEmail, seeded.adminPassword);
    return { seeded, cookie };
  }

  it("stores the key encrypted, never returns it, and keeps it when only models change", async () => {
    const { seeded, cookie } = await admin();
    const put = await call(handlePut, cookie, "PUT", { provider: "openai", apiKey: "sk-secret-123", models: ["gpt-5", " gpt-5 "] });
    expect(put.status).toBe(200);

    const get = await call(handleGet, cookie, "GET");
    const text = await get.text();
    expect(text).not.toContain("sk-secret-123");
    expect(JSON.parse(text).providers).toMatchObject([{ provider: "openai", models: ["gpt-5"], keySet: true }]);

    const [row] = await testDb.ownerDb.execute<{ api_key_enc: string }>(
      sql`select api_key_enc from prompt_registry.eval_provider_configs where organization_id = ${seeded.organizationId}`,
    );
    expect(row!.api_key_enc).not.toContain("sk-secret-123");

    const again = await call(handlePut, cookie, "PUT", { provider: "openai", models: ["gpt-5", "gpt-5-mini"] });
    expect(again.status).toBe(200);
    const [row2] = await testDb.ownerDb.execute<{ api_key_enc: string }>(
      sql`select api_key_enc from prompt_registry.eval_provider_configs where organization_id = ${seeded.organizationId}`,
    );
    expect(row2!.api_key_enc).toBe(row!.api_key_enc);
  });

  it("rejects a new provider without a key, an unknown provider, and no models (422)", async () => {
    const { cookie } = await admin();
    expect((await call(handlePut, cookie, "PUT", { provider: "anthropic", models: ["m"] })).status).toBe(422);
    expect((await call(handlePut, cookie, "PUT", { provider: "bogus", apiKey: "k", models: ["m"] })).status).toBe(422);
    expect((await call(handlePut, cookie, "PUT", { provider: "anthropic", apiKey: "k", models: [] })).status).toBe(422);
  });

  it("builds the org's pool from stored config so a submit is accepted, and delete removes it", async () => {
    const { seeded, cookie } = await admin();
    const name = `pool-${randomUUID()}`;
    await withTenantContext(testDb.appDb, seeded.organizationId, async (tx) => {
      const actor = { organizationId: seeded.organizationId, userId: seeded.adminUserId };
      await createPrompt(tx, actor, { organizationId: seeded.organizationId, name });
      await publishVersion(tx, actor, {
        organizationId: seeded.organizationId,
        promptName: name,
        version: "1.0.0",
        mainFile: { content: "Be brief." },
        supportingFiles: [{ name: "evals/cases.yaml", content: "cases:\n  - input: a\n    assert: [{contains: a}]\n" }],
      });
    });
    await call(putSettings, cookie, "PUT", { enabled: true });
    await call(handlePut, cookie, "PUT", { provider: "anthropic", apiKey: "k", models: ["claude-sonnet-5-5"] });
    expect((await call(handlePatch, cookie, "PATCH", { defaultJudge: "anthropic/claude-sonnet-5-5" })).status).toBe(200);

    const submit = (models: string[]) =>
      withApiRoute(submitRun, deps())(
        new Request("http://x", {
          method: "POST",
          headers: { cookie, "content-type": "application/json" },
          body: JSON.stringify({ models }),
        }),
        { params: Promise.resolve({ name, version: "1.0.0" }) },
      );
    expect((await submit(["anthropic/claude-sonnet-5-5"])).status).toBe(202);
    expect((await submit(["openai/gpt-5"])).status).toBe(422);

    expect((await call(handleDelete, cookie, "DELETE", { provider: "anthropic" })).status).toBe(200);
    expect((await submit(["anthropic/claude-sonnet-5-5"])).status).toBe(409);
  });
});
