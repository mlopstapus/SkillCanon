import { createHmac, randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { withTenantContext } from "@/shared/db/tenant-context";
import { startTestDb, type TestDb } from "@/shared/db/test-helpers";
import { assertCrossTenantDenied } from "@/shared/testing/tenant-isolation";
import { installations, prChecks, repoLinks } from "../infrastructure/schema";
import type { PullRequestDeps } from "./evaluate-pull-request";
import { getPrCheck } from "./evaluate-pull-request";
import { handleGithubWebhook } from "./handle-github-webhook";
import { unlinkRepo } from "./repo-links";

const env = {
  GITHUB_APP_ID: "1",
  GITHUB_APP_SLUG: "s",
  GITHUB_APP_PRIVATE_KEY: "unused-in-these-paths",
  GITHUB_APP_WEBHOOK_SECRET: "whsec",
};

/** 011/007: every table of this BC is RLS-protected, and the session-less webhook can only act inside the tenant its stored link names. */
describe("vcs-integration tenant isolation", () => {
  let testDb: TestDb;
  beforeAll(async () => {
    testDb = await startTestDb();
  }, 120_000);
  afterAll(async () => testDb.teardown());

  async function seedOrg(githubRepoId: number) {
    const organizationId = randomUUID();
    const githubInstallationId = Math.floor(Math.random() * 1e9);
    const [installation] = await testDb.ownerDb
      .insert(installations)
      .values({ organizationId, githubInstallationId, githubAccountLogin: "acme", githubAccountType: "Organization" })
      .returning();
    const [link] = await testDb.ownerDb
      .insert(repoLinks)
      .values({ organizationId, installationId: installation!.id, githubRepoId, repoFullName: "acme/api", projectId: randomUUID(), linkedByUserId: randomUUID() })
      .returning();
    const [check] = await testDb.ownerDb
      .insert(prChecks)
      .values({ organizationId, repoLinkId: link!.id, prNumber: 1, headSha: "h", status: "pass", results: [] })
      .returning();
    return { organizationId, githubInstallationId, installation: installation!, link: link!, check: check! };
  }
  const as = <T,>(org: string, fn: Parameters<typeof withTenantContext<T>>[2]) => withTenantContext(testDb.appDb, org, fn);
  const rows = async (org: string, table: string, id: string) =>
    as(org, async (tx) => Array.from(await tx.execute(sql.raw(`select id from vcs_integration.${table} where id = '${id}'`))));

  it.each([
    ["installations", (s: Awaited<ReturnType<typeof seedOrg>>) => s.installation.id],
    ["repo_links", (s: Awaited<ReturnType<typeof seedOrg>>) => s.link.id],
    ["pr_checks", (s: Awaited<ReturnType<typeof seedOrg>>) => s.check.id],
  ])("denies cross-organization read of %s by id using RLS alone, with no app-layer filter", async (table, pick) => {
    const [a, b] = [await seedOrg(1), await seedOrg(2)];
    await assertCrossTenantDenied({
      actingAsOrg: a.organizationId,
      resourceOwnedByOrg: b.organizationId,
      resourceId: pick(b),
      fetchResourceById: (id) => rows(a.organizationId, table, id),
    });
    expect(await rows(b.organizationId, table, pick(b))).toHaveLength(1); // the owner still sees it
  });

  it("denies cross-organization writes: updates touch nothing and inserts for another org are rejected", async () => {
    const [a, b] = [await seedOrg(3), await seedOrg(4)];
    const updated = await as(a.organizationId, (tx) =>
      tx.execute(sql`update vcs_integration.repo_links set repo_full_name = 'hijack' where id = ${b.link.id} returning id`),
    );
    expect(Array.from(updated)).toHaveLength(0);
    await expect(
      as(a.organizationId, (tx) =>
        tx.execute(sql`insert into vcs_integration.installations (organization_id, github_installation_id, github_account_login, github_account_type) values (${b.organizationId}, ${Math.floor(Math.random() * 1e9)}, 'x', 'User')`),
      ),
    ).rejects.toThrow();
    await expect(
      as(a.organizationId, (tx) => unlinkRepo(tx, { organizationId: a.organizationId, userId: randomUUID(), role: "admin" }, b.link.id)),
    ).rejects.toThrow(/No such repository link/);
    expect(await as(a.organizationId, (tx) => getPrCheck(tx, a.organizationId, b.link.id, 1))).toEqual({ latest: null, history: [] });
  });

  it("keeps webhook bookkeeping out of the app role's reach entirely", async () => {
    await expect(as(randomUUID(), (tx) => tx.execute(sql`select * from vcs_integration.webhook_deliveries`))).rejects.toThrow();
  });

  describe("webhook path", () => {
    const deliver = (payload: object, deps?: Omit<PullRequestDeps, "config">) => {
      const rawBody = JSON.stringify(payload);
      return handleGithubWebhook(
        testDb.authDb,
        { rawBody, signatureHeader: `sha256=${createHmac("sha256", "whsec").update(rawBody).digest("hex")}`, deliveryId: randomUUID(), eventName: "pull_request" },
        env,
        deps,
      );
    };
    const evaluatedTenants: string[] = [];
    const deps: Omit<PullRequestDeps, "config"> = {
      inTenant: async (org) => {
        evaluatedTenants.push(org);
        throw new Error("stop after recording which tenant was resolved");
      },
      requiredSkills: async () => [],
      usageByCommits: async () => [],
      projectName: async () => null,
    };

    it("resolves the tenant only from the stored link, ignoring claims in the payload", async () => {
      const [a, b] = [await seedOrg(11), await seedOrg(12)];
      // The payload names org B's installation id with org A's repo id: no link matches both.
      expect(await deliver({ action: "opened", repository: { id: 11, full_name: "acme/api" }, pull_request: { number: 9, head: { sha: "x" } }, installation: { id: b.githubInstallationId } }, deps)).toEqual({ status: "ignored" });
      expect(evaluatedTenants).toEqual([]);

      // A payload stuffed with org B identifiers still only reaches org A's tenant.
      // The stub throws once it has seen the tenant, so the delivery itself rejects.
      await expect(
        deliver(
          { action: "opened", organization_id: b.organizationId, sender: { login: "b-user" }, repository: { id: 11, full_name: "acme/api" }, pull_request: { number: 9, head: { sha: "x" }, user: { login: "b-user" } }, installation: { id: a.githubInstallationId } },
          deps,
        ),
      ).rejects.toThrow(/stop after recording/);
      expect(new Set(evaluatedTenants)).toEqual(new Set([a.organizationId]));
      const leaked = await testDb.ownerDb.execute<{ n: number }>(sql`select count(*)::int as n from vcs_integration.pr_checks where organization_id = ${b.organizationId} and pr_number = 9`);
      expect(Number(leaked[0]?.n)).toBe(0);
    });
  });
});
