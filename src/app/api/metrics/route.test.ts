import { randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { recordPromptUsage } from "@/bcs/distribution";
import { withTenantContext } from "@/shared/db";
import { startTestDb, type TestDb } from "@/shared/db/test-helpers";
import { withApiRoute } from "@/shared/api/handler";
import { loginAndBuildCookie, seedOrgWithAdmin } from "@/shared/api/test-helpers";
import { handleGet } from "./route";

describe("/api/metrics", () => {
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

  it("returns zeroed org metrics when no usage exists", async () => {
    const seeded = await seedOrgWithAdmin(testDb.authDb);
    const cookie = await loginAndBuildCookie(testDb.authDb, seeded.adminEmail, seeded.adminPassword);
    const GET = route();

    const response = await GET(new Request("http://x/api/metrics", { headers: { cookie } }), {
      params: Promise.resolve({}),
    });

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.totalInvocations).toBe(0);
    expect(body.successCount).toBe(0);
    expect(body.bySkill).toEqual([]);
  });

  it("returns aggregate metrics for only the authenticated caller's organization", async () => {
    const seededA = await seedOrgWithAdmin(testDb.authDb);
    const seededB = await seedOrgWithAdmin(testDb.authDb);
    const promptId = randomUUID();
    const promptVersionId = randomUUID();
    await withTenantContext(testDb.appDb, seededA.organizationId, async (tx) => {
      await recordPromptUsage(tx, { organizationId: seededA.organizationId, promptId, promptVersionId, promptVersion: "1.0.0", statusCode: 200, latencyMs: 20 });
      await recordPromptUsage(tx, { organizationId: seededA.organizationId, promptId, promptVersionId, promptVersion: "1.0.0", statusCode: 500, latencyMs: 40 });
    });
    await withTenantContext(testDb.appDb, seededB.organizationId, (tx) =>
      recordPromptUsage(tx, { organizationId: seededB.organizationId, promptId, promptVersionId, promptVersion: "1.0.0", statusCode: 200, latencyMs: 999 }),
    );

    const cookieA = await loginAndBuildCookie(testDb.authDb, seededA.adminEmail, seededA.adminPassword);
    const GET = route();
    const response = await GET(new Request("http://x/api/metrics?from=2000-01-01&to=2999-01-01", { headers: { cookie: cookieA } }), {
      params: Promise.resolve({}),
    });

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.totalInvocations).toBe(2);
    expect(body.successCount).toBe(1);
    expect(body.failureCount).toBe(1);
    expect(body.averageLatencyMs).toBe(30);
    expect(body.byStatus).toEqual([
      { statusCode: 200, runCount: 1 },
      { statusCode: 500, runCount: 1 },
    ]);
    expect(body.bySkill).toEqual([
      expect.objectContaining({ promptId, promptVersionId, promptVersion: "1.0.0", runCount: 2 }),
    ]);
  });

  it("validates invalid time windows", async () => {
    const seeded = await seedOrgWithAdmin(testDb.authDb);
    const cookie = await loginAndBuildCookie(testDb.authDb, seeded.adminEmail, seeded.adminPassword);
    const GET = route();

    const response = await GET(new Request("http://x/api/metrics?from=2026-08-05&to=2026-08-01", { headers: { cookie } }), {
      params: Promise.resolve({}),
    });

    expect(response.status).toBe(422);
    const body = await response.json();
    expect(body.error.code).toBe("VALIDATION_FAILED");
  });

  it("returns 401 with no credential", async () => {
    const GET = route();
    const response = await GET(new Request("http://x/api/metrics"), { params: Promise.resolve({}) });
    expect(response.status).toBe(401);
  });
});
