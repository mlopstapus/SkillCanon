import { generateKeyPairSync, randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { withTenantContext } from "@/shared/db";
import { startTestDb, type TestDb } from "@/shared/db/test-helpers";
import { signInstallState } from "../domain/installation";
import { getGithubAppConfig } from "../infrastructure/github-app";
import { completeInstall } from "./installations";
import { linkRepo, listAccessibleRepos, listRepoLinks, unlinkRepo, type VcsActor } from "./repo-links";

const { privateKey } = generateKeyPairSync("rsa", {
  modulusLength: 2048,
  privateKeyEncoding: { type: "pkcs8", format: "pem" },
  publicKeyEncoding: { type: "spki", format: "pem" },
});
const config = getGithubAppConfig({
  GITHUB_APP_ID: "1",
  GITHUB_APP_SLUG: "s",
  GITHUB_APP_PRIVATE_KEY: privateKey,
  GITHUB_APP_WEBHOOK_SECRET: "whsec",
})!;

const REPOS = [
  { id: 101, full_name: "acme/api" },
  { id: 102, full_name: "acme/web" },
];
const githubFetch = vi.fn(async (url: string | URL | Request) => {
  const u = String(url);
  if (u.includes("/installation/repositories")) return new Response(JSON.stringify({ repositories: REPOS }));
  if (u.endsWith("/access_tokens")) return new Response(JSON.stringify({ token: "ghs_x" }), { status: 201 });
  return new Response(JSON.stringify({ account: { login: "acme", type: "Organization" } }));
}) as unknown as typeof fetch;

describe("repo links", () => {
  let testDb: TestDb;
  beforeAll(async () => {
    testDb = await startTestDb();
  }, 120_000);
  afterAll(async () => testDb.teardown());

  async function fixture() {
    const orgId = randomUUID();
    const admin: VcsActor = { organizationId: orgId, userId: randomUUID(), role: "admin" };
    const installation = await withTenantContext(testDb.appDb, orgId, (tx) =>
      completeInstall(tx, config, admin, { state: signInstallState(admin, "whsec"), githubInstallationId: Math.floor(Math.random() * 1e9) }, undefined, githubFetch),
    );
    return { orgId, admin, installation };
  }
  const yes = async () => true;
  const link = (f: Awaited<ReturnType<typeof fixture>>, projectId: string, githubRepoId = 101, actor = f.admin, projectExists = yes) =>
    withTenantContext(testDb.appDb, f.orgId, (tx) =>
      linkRepo(tx, config, actor, { installationId: f.installation.id, githubRepoId, projectId }, { projectExists, fetchImpl: githubFetch }),
    );
  const audit = async (org: string, action: string) =>
    Number((await testDb.ownerDb.execute<{ n: number }>(sql`select count(*)::int as n from audit.audit_events where organization_id = ${org} and action = ${action}`))[0]?.n);

  it("links one repo to two projects as two distinct links, and rejects the same project twice", async () => {
    const f = await fixture();
    const [p1, p2] = [randomUUID(), randomUUID()];
    const a = await link(f, p1);
    const b = await link(f, p2);
    expect(a.id).not.toBe(b.id);
    expect(a.repoFullName).toBe("acme/api");
    await expect(link(f, p1)).rejects.toThrow(/already linked/);
    expect(await audit(f.orgId, "repo_link.created")).toBe(2);
  });

  it("rejects a repo the installation cannot see, an unknown project, and a non-admin", async () => {
    const f = await fixture();
    await expect(link(f, randomUUID(), 999)).rejects.toThrow(/not accessible/);
    await expect(link(f, randomUUID(), 101, f.admin, async () => false)).rejects.toThrow(/No such project/);
    await expect(link(f, randomUUID(), 101, { ...f.admin, role: "member" })).rejects.toThrow(/organization admin/);
  });

  it("lists links by project with the installation's account, and unlinking is soft and lets the project relink", async () => {
    const f = await fixture();
    const p1 = randomUUID();
    const created = await link(f, p1);
    await link(f, randomUUID(), 102);
    const forP1 = await withTenantContext(testDb.appDb, f.orgId, (tx) => listRepoLinks(tx, f.orgId, p1));
    expect(forP1).toHaveLength(1);
    expect(forP1[0]).toMatchObject({ repoFullName: "acme/api", installationAccountLogin: "acme" });

    await withTenantContext(testDb.appDb, f.orgId, (tx) => unlinkRepo(tx, f.admin, created.id));
    expect(await withTenantContext(testDb.appDb, f.orgId, (tx) => listRepoLinks(tx, f.orgId, p1))).toHaveLength(0);
    // the row is kept (history), only marked
    expect(Number((await testDb.ownerDb.execute<{ n: number }>(sql`select count(*)::int as n from vcs_integration.repo_links where id = ${created.id} and unlinked_at is not null`))[0]?.n)).toBe(1);
    await expect(link(f, p1)).resolves.toBeTruthy();
    await expect(withTenantContext(testDb.appDb, f.orgId, (tx) => unlinkRepo(tx, f.admin, created.id))).rejects.toThrow(/No such repository link/);
    expect(await audit(f.orgId, "repo_link.deleted")).toBe(1);
  });

  it("never shows or touches another organization's links or installations", async () => {
    const a = await fixture();
    const b = await fixture();
    const created = await link(a, randomUUID());
    expect(await withTenantContext(testDb.appDb, b.orgId, (tx) => listRepoLinks(tx, b.orgId))).toHaveLength(0);
    await expect(withTenantContext(testDb.appDb, b.orgId, (tx) => unlinkRepo(tx, b.admin, created.id))).rejects.toThrow(/No such repository link/);
    await expect(withTenantContext(testDb.appDb, b.orgId, (tx) => listAccessibleRepos(tx, config, b.orgId, a.installation.id, githubFetch))).rejects.toThrow(/suspended, deleted, or unknown/);
  });
});
