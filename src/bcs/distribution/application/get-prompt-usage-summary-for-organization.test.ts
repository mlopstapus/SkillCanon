import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { withTenantContext } from "@/shared/db";
import { startTestDb, type TestDb } from "@/shared/db/test-helpers";
import { recordPromptUsage } from "./record-prompt-usage";
import { getPromptUsageSummaryForOrganization } from "./get-prompt-usage-summary-for-organization";

describe("getPromptUsageSummaryForOrganization", () => {
  let testDb: TestDb;

  beforeAll(async () => {
    testDb = await startTestDb();
  }, 120_000);

  afterAll(async () => {
    await testDb.teardown();
  });

  it("returns a zero summary for an organization with no usage", async () => {
    const organizationId = randomUUID();
    const summary = await withTenantContext(testDb.appDb, organizationId, (tx) =>
      getPromptUsageSummaryForOrganization(tx, organizationId, {
        window: { from: new Date("2026-08-01T00:00:00.000Z"), to: new Date("2026-08-31T23:59:59.999Z") },
      }),
    );

    expect(summary.totalInvocations).toBe(0);
    expect(summary.successCount).toBe(0);
    expect(summary.failureCount).toBe(0);
    expect(summary.averageLatencyMs).toBeNull();
    expect(summary.bySkill).toEqual([]);
    expect(summary.byStatus).toEqual([]);
  });

  it("aggregates status, skill/version, latency, and day within the requested organization", async () => {
    const organizationId = randomUUID();
    const otherOrgId = randomUUID();
    const promptId = randomUUID();
    const promptVersionId = randomUUID();

    await withTenantContext(testDb.appDb, organizationId, async (tx) => {
      await recordPromptUsage(tx, { organizationId, promptId, promptVersionId, promptVersion: "1.0.0", statusCode: 200, latencyMs: 10 });
      await recordPromptUsage(tx, { organizationId, promptId, promptVersionId, promptVersion: "1.0.0", statusCode: 500, latencyMs: 30 });
    });
    await withTenantContext(testDb.appDb, otherOrgId, (tx) =>
      recordPromptUsage(tx, { organizationId: otherOrgId, promptId, promptVersionId, promptVersion: "1.0.0", statusCode: 200, latencyMs: 999 }),
    );

    const summary = await withTenantContext(testDb.appDb, organizationId, (tx) =>
      getPromptUsageSummaryForOrganization(tx, organizationId, {
        window: { from: new Date(0), to: new Date(Date.now() + 1000) },
      }),
    );

    expect(summary.totalInvocations).toBe(2);
    expect(summary.successCount).toBe(1);
    expect(summary.failureCount).toBe(1);
    expect(summary.averageLatencyMs).toBe(20);
    expect(summary.p95LatencyMs).toBe(30);
    expect(summary.byStatus).toEqual([
      { statusCode: 200, runCount: 1 },
      { statusCode: 500, runCount: 1 },
    ]);
    expect(summary.bySkill).toEqual([
      expect.objectContaining({
        promptId,
        promptVersionId,
        promptVersion: "1.0.0",
        runCount: 2,
        successCount: 1,
        failureCount: 1,
        averageLatencyMs: 20,
      }),
    ]);
    expect(summary.dailyCounts.reduce((sum, row) => sum + row.count, 0)).toBe(2);
  });

  it("honors the requested time window", async () => {
    const organizationId = randomUUID();
    const promptId = randomUUID();
    const promptVersionId = randomUUID();

    await withTenantContext(testDb.appDb, organizationId, (tx) =>
      recordPromptUsage(tx, { organizationId, promptId, promptVersionId, statusCode: 200 }),
    );

    const summary = await withTenantContext(testDb.appDb, organizationId, (tx) =>
      getPromptUsageSummaryForOrganization(tx, organizationId, {
        window: { from: new Date("2000-01-01T00:00:00.000Z"), to: new Date("2000-01-02T00:00:00.000Z") },
      }),
    );
    expect(summary.totalInvocations).toBe(0);
  });
});
