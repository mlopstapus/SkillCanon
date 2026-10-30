import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { withTenantContext } from "@/shared/db";
import { startTestDb, type TestDb } from "@/shared/db/test-helpers";
import { installations, prChecks, repoLinks } from "../infrastructure/schema";
import { getComplianceSummaryForProject, listRecentPrChecksForProject } from "./project-checks";

describe("project checks read side", () => {
  let testDb: TestDb;
  beforeAll(async () => {
    testDb = await startTestDb();
  }, 120_000);
  afterAll(async () => testDb.teardown());

  async function seed(statuses: Array<{ pr: number; head: string; status: "pass" | "fail" | "neutral"; at?: Date; link?: number }>) {
    const organizationId = randomUUID();
    const projectId = randomUUID();
    const [inst] = await testDb.ownerDb
      .insert(installations)
      .values({ organizationId, githubInstallationId: Math.floor(Math.random() * 1e9), githubAccountLogin: "acme", githubAccountType: "Organization" })
      .returning();
    const links = await testDb.ownerDb
      .insert(repoLinks)
      .values(
        ["acme/api", "acme/web"].map((repoFullName, i) => ({
          organizationId,
          installationId: inst!.id,
          githubRepoId: 100 + i,
          repoFullName,
          projectId,
          linkedByUserId: randomUUID(),
          unlinkedAt: i === 1 ? new Date() : null, // second repo was unlinked: history must still count
        })),
      )
      .returning();
    for (const s of statuses) {
      await testDb.ownerDb.insert(prChecks).values({
        organizationId,
        repoLinkId: links[s.link ?? 0]!.id,
        prNumber: s.pr,
        headSha: s.head,
        status: s.status,
        results: [],
        evaluatedAt: s.at ?? new Date(),
      });
    }
    return { organizationId, projectId };
  }
  const summary = (f: { organizationId: string; projectId: string }, since?: Date) =>
    withTenantContext(testDb.appDb, f.organizationId, (tx) => getComplianceSummaryForProject(tx, f.organizationId, f.projectId, { since }));

  it("rates pass against pass+fail across every repo, excluding neutral from the rate", async () => {
    const f = await seed([
      { pr: 1, head: "a", status: "pass" },
      { pr: 2, head: "b", status: "pass" },
      { pr: 3, head: "c", status: "fail" },
      { pr: 4, head: "d", status: "neutral" },
      { pr: 5, head: "e", status: "pass", link: 1 },
    ]);
    expect(await summary(f)).toEqual({ totalEvaluated: 5, passed: 3, failed: 1, neutral: 1, rate: 0.75 });
  });

  it("has a null rate with nothing to rate, and respects the since window", async () => {
    const old = new Date(Date.now() - 90 * 86_400_000);
    const f = await seed([{ pr: 1, head: "a", status: "pass", at: old }, { pr: 2, head: "b", status: "neutral" }]);
    expect(await summary(f, new Date(Date.now() - 30 * 86_400_000))).toEqual({ totalEvaluated: 1, passed: 0, failed: 0, neutral: 1, rate: null });
    expect((await summary(f)).totalEvaluated).toBe(2);
  });

  it("lists the latest evaluation per PR, newest first, and never leaks another organization's checks", async () => {
    const f = await seed([
      { pr: 1, head: "old", status: "fail", at: new Date(Date.now() - 10_000) },
      { pr: 1, head: "new", status: "pass", at: new Date() },
      { pr: 2, head: "x", status: "fail", at: new Date(Date.now() - 5_000) },
    ]);
    const rows = await withTenantContext(testDb.appDb, f.organizationId, (tx) => listRecentPrChecksForProject(tx, f.organizationId, f.projectId));
    expect(rows.map((r) => [r.prNumber, r.headSha, r.status])).toEqual([[1, "new", "pass"], [2, "x", "fail"]]);
    expect(rows[0]?.repoFullName).toBe("acme/api");
    const other = randomUUID();
    expect(await withTenantContext(testDb.appDb, other, (tx) => listRecentPrChecksForProject(tx, other, f.projectId))).toEqual([]);
    expect(await summary({ organizationId: other, projectId: f.projectId })).toMatchObject({ totalEvaluated: 0, rate: null });
  });
});
