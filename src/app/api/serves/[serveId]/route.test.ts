import { randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createPrompt, publishVersion, type PromptActor } from "@/bcs/prompt-registry";
import { withTenantContext } from "@/shared/db";
import { startTestDb, type TestDb } from "@/shared/db/test-helpers";
import { withApiRoute } from "@/shared/api/handler";
import { loginAndBuildCookie, seedOrgWithAdmin } from "@/shared/api/test-helpers";
import { handlePost as expandHandler } from "../../skills/[name]/expand/route";
import { handleGet } from "./route";

describe("/api/serves/[serveId]", () => {
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

  async function serve() {
    const seeded = await seedOrgWithAdmin(testDb.authDb);
    const cookie = await loginAndBuildCookie(testDb.authDb, seeded.adminEmail, seeded.adminPassword);
    const name = `skill-${randomUUID()}`;
    const actor: PromptActor = { organizationId: seeded.organizationId, userId: seeded.adminUserId };
    await withTenantContext(testDb.appDb, seeded.organizationId, async (tx) => {
      await createPrompt(tx, actor, { organizationId: seeded.organizationId, name });
      await publishVersion(tx, actor, {
        organizationId: seeded.organizationId,
        promptName: name,
        version: "1",
        mainFile: { content: "Hello" },
      });
    });
    const response = await withApiRoute(expandHandler, { authDb: testDb.authDb, db: testDb.appDb })(
      new Request(`http://x/api/skills/${name}/expand`, {
        method: "POST",
        headers: { cookie, "content-type": "application/json" },
        body: JSON.stringify({}),
      }),
      { params: Promise.resolve({ name }) },
    );
    return { seeded, cookie, name, expanded: await response.json() };
  }

  const get = (cookie: string, serveId: string) =>
    withApiRoute(handleGet, { authDb: testDb.authDb, db: testDb.appDb })(
      new Request(`http://x/api/serves/${serveId}`, { headers: { cookie } }),
      { params: Promise.resolve({ serveId }) },
    );

  it("returns what was served for the caller's organization", async () => {
    const { seeded, cookie, name, expanded } = await serve();

    const response = await get(cookie, expanded.serveId);

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      serveId: expanded.serveId,
      skill: name,
      version: "1",
      contentDigest: expanded.contentDigest,
      userId: seeded.adminUserId,
    });
  });

  it("404s for a serve in another organization and for a malformed or unknown id", async () => {
    const { expanded } = await serve();
    const other = await seedOrgWithAdmin(testDb.authDb);
    const otherCookie = await loginAndBuildCookie(testDb.authDb, other.adminEmail, other.adminPassword);

    for (const id of [expanded.serveId, randomUUID(), "not-a-uuid"]) {
      const response = await get(otherCookie, id);
      expect(response.status).toBe(404);
      expect((await response.json()).error.code).toBe("SERVE_NOT_FOUND");
    }
  });
});
