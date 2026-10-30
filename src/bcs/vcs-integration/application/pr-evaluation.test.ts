import { createHmac, generateKeyPairSync, randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { withTenantContext } from "@/shared/db";
import { startTestDb, type TestDb } from "@/shared/db/test-helpers";
import { signInstallState } from "../domain/installation";
import { evaluateRequiredSkills } from "../domain/pr-check";
import { getGithubAppConfig } from "../infrastructure/github-app";
import { getPrCheck, type PullRequestDeps } from "./evaluate-pull-request";
import { handleGithubWebhook } from "./handle-github-webhook";
import { completeInstall } from "./installations";
import { linkRepo, unlinkRepo, type VcsActor } from "./repo-links";

const { privateKey } = generateKeyPairSync("rsa", {
  modulusLength: 2048,
  privateKeyEncoding: { type: "pkcs8", format: "pem" },
  publicKeyEncoding: { type: "spki", format: "pem" },
});
const env = {
  GITHUB_APP_ID: "1",
  GITHUB_APP_SLUG: "s",
  GITHUB_APP_PRIVATE_KEY: privateKey,
  GITHUB_APP_WEBHOOK_SECRET: "whsec",
};
const config = getGithubAppConfig(env)!;

describe("evaluateRequiredSkills", () => {
  it("matches by name only, on any commit; no required skills passes", () => {
    expect(evaluateRequiredSkills(["a", "b"], [{ skillName: "a", gitCommitSha: "c1" }, { skillName: "b", gitCommitSha: "c2" }]).status).toBe("pass");
    const fail = evaluateRequiredSkills(["a", "b", "a"], [{ skillName: "a", gitCommitSha: "c1" }]);
    expect(fail.status).toBe("fail");
    expect(fail.results).toEqual([
      { skillName: "a", satisfied: true, matchedCommitSha: "c1" },
      { skillName: "b", satisfied: false, matchedCommitSha: null },
    ]);
    expect(evaluateRequiredSkills([], []).status).toBe("pass");
  });
});

describe("pull request evaluation", () => {
  let testDb: TestDb;
  beforeAll(async () => {
    testDb = await startTestDb();
  }, 120_000);
  afterAll(async () => testDb.teardown());

  /** A fake GitHub that records check-run calls. */
  function fakeGithub(opts: { failCommits?: boolean } = {}) {
    const calls: Array<{ method: string; url: string; body: Record<string, unknown> }> = [];
    let nextId = 5000;
    const fetchImpl = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      const u = String(url);
      const body = init?.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : {};
      calls.push({ method: init?.method ?? "GET", url: u, body });
      if (u.includes("/installation/repositories")) return new Response(JSON.stringify({ repositories: [{ id: 7, full_name: "acme/api" }] }));
      if (u.endsWith("/access_tokens")) return new Response(JSON.stringify({ token: "ghs_x" }), { status: 201 });
      if (u.includes("/pulls/") && u.includes("/commits")) {
        return opts.failCommits ? new Response("{}", { status: 500 }) : new Response(JSON.stringify([{ sha: "c1" }, { sha: "c2" }]));
      }
      if (u.endsWith("/check-runs")) return new Response(JSON.stringify({ id: nextId++ }), { status: 201 });
      if (u.includes("/check-runs/")) return new Response("{}");
      return new Response(JSON.stringify({ account: { login: "acme", type: "Organization" } }));
    }) as unknown as typeof fetch;
    return { fetchImpl, calls, checkRunCalls: () => calls.filter((c) => c.url.includes("/check-runs")) };
  }

  async function fixture(required: string[], used: string[], fetchImpl: typeof fetch) {
    const orgId = randomUUID();
    const admin: VcsActor = { organizationId: orgId, userId: randomUUID(), role: "admin" };
    const githubInstallationId = Math.floor(Math.random() * 1e9);
    const projectId = randomUUID();
    const link = await withTenantContext(testDb.appDb, orgId, async (tx) => {
      const installation = await completeInstall(tx, config, admin, { state: signInstallState(admin, "whsec"), githubInstallationId }, undefined, fetchImpl);
      return linkRepo(tx, config, admin, { installationId: installation.id, githubRepoId: 7, projectId }, { projectExists: async () => true, fetchImpl });
    });
    const deps: Omit<PullRequestDeps, "config"> = {
      fetchImpl,
      inTenant: (org, fn) => withTenantContext(testDb.appDb, org, (tx) => fn(tx as never)),
      requiredSkills: async () => required,
      usageByCommits: async () => used.map((skillName) => ({ skillName, gitCommitSha: "c2" })),
      projectName: async () => "Docs",
    };
    return { orgId, admin, githubInstallationId, link, deps };
  }

  const deliver = (f: Awaited<ReturnType<typeof fixture>>, over: { action?: string; sha?: string; deliveryId?: string; repoId?: number; installationId?: number; number?: number } = {}) => {
    const rawBody = JSON.stringify({
      action: over.action ?? "opened",
      repository: { id: over.repoId ?? 7, full_name: "acme/api" },
      pull_request: { number: over.number ?? 3, head: { sha: over.sha ?? "headA" } },
      installation: { id: over.installationId ?? f.githubInstallationId },
    });
    return handleGithubWebhook(
      testDb.authDb,
      { rawBody, signatureHeader: `sha256=${createHmac("sha256", "whsec").update(rawBody).digest("hex")}`, deliveryId: over.deliveryId ?? randomUUID(), eventName: "pull_request" },
      env,
      f.deps,
    );
  };
  const checks = (f: Awaited<ReturnType<typeof fixture>>) =>
    withTenantContext(testDb.appDb, f.orgId, (tx) => getPrCheck(tx, f.orgId, f.link.id, 3));
  const auditCount = async (org: string) =>
    Number((await testDb.ownerDb.execute<{ n: number }>(sql`select count(*)::int as n from audit.audit_events where organization_id = ${org} and action = 'pr_check.created'`))[0]?.n);

  it("posts a pass check run when every required skill ran, and records the check", async () => {
    const gh = fakeGithub();
    const f = await fixture(["a", "b"], ["a", "b"], gh.fetchImpl);
    expect(await deliver(f)).toEqual({ status: "handled" });
    const { latest } = await checks(f);
    expect(latest).toMatchObject({ status: "pass", headSha: "headA", prNumber: 3 });
    expect(latest?.results.every((r) => r.satisfied)).toBe(true);
    const run = gh.checkRunCalls().find((c) => c.method === "POST")!;
    expect(run.body).toMatchObject({ conclusion: "success", head_sha: "headA", status: "completed" });
    expect(await auditCount(f.orgId)).toBe(1);
  });

  it("posts a fail check run naming the missing skill", async () => {
    const gh = fakeGithub();
    const f = await fixture(["a", "b"], ["a"], gh.fetchImpl);
    await deliver(f);
    expect((await checks(f)).latest?.status).toBe("fail");
    const output = gh.checkRunCalls().find((c) => c.method === "POST")!.body.output as { title: string; summary: string };
    expect(gh.checkRunCalls().find((c) => c.method === "POST")!.body.conclusion).toBe("failure");
    expect(output.summary).toContain("missing: b");
    expect(output.summary).toContain("ran: a");
  });

  it("updates the same check run for the same head, and a new head gets a new row and check run", async () => {
    const gh = fakeGithub();
    const f = await fixture(["a"], ["a"], gh.fetchImpl);
    await deliver(f, { action: "opened" });
    await deliver(f, { action: "synchronize" }); // same head, new delivery
    expect((await checks(f)).history).toHaveLength(1);
    expect(gh.checkRunCalls().filter((c) => c.method === "POST")).toHaveLength(1);
    expect(gh.checkRunCalls().filter((c) => c.method === "PATCH")).toHaveLength(1);
    await deliver(f, { action: "synchronize", sha: "headB" });
    expect((await checks(f)).history).toHaveLength(2);
    expect(gh.checkRunCalls().filter((c) => c.method === "POST")).toHaveLength(2);
  });

  it("does nothing for a redelivered webhook", async () => {
    const gh = fakeGithub();
    const f = await fixture(["a"], ["a"], gh.fetchImpl);
    const id = randomUUID();
    await deliver(f, { deliveryId: id });
    const before = gh.calls.length;
    expect(await deliver(f, { deliveryId: id })).toEqual({ status: "duplicate" });
    expect(gh.calls.length).toBe(before);
    expect((await checks(f)).history).toHaveLength(1);
  });

  it("writes a neutral check with a visible error when evaluation fails", async () => {
    const gh = fakeGithub({ failCommits: true });
    const f = await fixture(["a"], ["a"], gh.fetchImpl);
    await deliver(f);
    const { latest } = await checks(f);
    expect(latest).toMatchObject({ status: "neutral" });
    expect(latest?.error).toContain("HTTP 500");
    const run = gh.checkRunCalls().find((c) => c.method === "POST")!;
    expect(run.body.conclusion).toBe("neutral");
    expect((run.body.output as { summary: string }).summary).toContain("could not check");
  });

  it("ignores an unlinked repo, an unlinked link, a forged installation id and non-evaluated actions", async () => {
    const gh = fakeGithub();
    const f = await fixture(["a"], ["a"], gh.fetchImpl);
    const before = gh.checkRunCalls().length;
    expect(await deliver(f, { repoId: 999 })).toEqual({ status: "ignored" });
    expect(await deliver(f, { installationId: f.githubInstallationId + 1 })).toEqual({ status: "ignored" });
    expect(await deliver(f, { action: "closed" })).toEqual({ status: "ignored" });
    await withTenantContext(testDb.appDb, f.orgId, (tx) => unlinkRepo(tx, f.admin, f.link.id));
    expect(await deliver(f, { sha: "headZ" })).toEqual({ status: "ignored" });
    expect(gh.checkRunCalls().length).toBe(before);
    // unlinking keeps history readable
    expect((await checks(f)).history).toHaveLength(0);
  });

  it("keeps check history readable after unlinking, and isolates it per organization", async () => {
    const gh = fakeGithub();
    const f = await fixture(["a"], ["a"], gh.fetchImpl);
    await deliver(f);
    await withTenantContext(testDb.appDb, f.orgId, (tx) => unlinkRepo(tx, f.admin, f.link.id));
    expect((await checks(f)).history).toHaveLength(1);
    const other = randomUUID();
    expect(await withTenantContext(testDb.appDb, other, (tx) => getPrCheck(tx, other, f.link.id, 3))).toEqual({ latest: null, history: [] });
  });
});
