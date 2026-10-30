import { createHmac, generateKeyPairSync, randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { withTenantContext } from "@/shared/db";
import { startTestDb, type TestDb } from "@/shared/db/test-helpers";
import { signInstallState } from "../domain/installation";
import { getGithubAppConfig } from "../infrastructure/github-app";
import { handleGithubWebhook } from "./handle-github-webhook";
import { buildInstallUrl, completeInstall, getInstallationAccessToken, listInstallations } from "./installations";

const { privateKey } = generateKeyPairSync("rsa", {
  modulusLength: 2048,
  privateKeyEncoding: { type: "pkcs8", format: "pem" },
  publicKeyEncoding: { type: "spki", format: "pem" },
});
const env = {
  GITHUB_APP_ID: "1",
  GITHUB_APP_SLUG: "skillcanon-test",
  GITHUB_APP_PRIVATE_KEY: privateKey,
  GITHUB_APP_WEBHOOK_SECRET: "whsec",
};
const config = getGithubAppConfig(env)!;

function githubFetch(account = { login: "acme", type: "Organization" }) {
  return vi.fn(async (url: string | URL | Request) =>
    String(url).endsWith("/access_tokens")
      ? new Response(JSON.stringify({ token: "ghs_x" }), { status: 201 })
      : new Response(JSON.stringify({ account })),
  ) as unknown as typeof fetch;
}

function deliver(db: TestDb["authDb"], event: string, payload: object, deliveryId = randomUUID(), secret = "whsec") {
  const rawBody = JSON.stringify(payload);
  return handleGithubWebhook(
    db,
    {
      rawBody,
      signatureHeader: `sha256=${createHmac("sha256", secret).update(rawBody).digest("hex")}`,
      deliveryId,
      eventName: event,
    },
    env,
  );
}

describe("vcs installations", () => {
  let testDb: TestDb;
  let orgA: string;
  let orgB: string;
  let userA: string;

  beforeAll(async () => {
    testDb = await startTestDb();
  }, 120_000);
  afterAll(async () => testDb.teardown());

  beforeEach(async () => {
    orgA = randomUUID();
    orgB = randomUUID();
    userA = randomUUID();
  });

  const actorA = () => ({ organizationId: orgA, userId: userA });
  const install = (org: string, user: string, ghId: number, fetchImpl = githubFetch()) =>
    withTenantContext(testDb.appDb, org, (tx) =>
      completeInstall(tx, config, { organizationId: org, userId: user }, { state: signInstallState({ organizationId: org, userId: user }, "whsec"), githubInstallationId: ghId }, undefined, fetchImpl),
    );
  const ghId = () => Math.floor(Math.random() * 1e9);
  const auditCount = async (org: string, action: string) =>
    Number(
      (await testDb.ownerDb.execute<{ n: number }>(sql`select count(*)::int as n from audit.audit_events where organization_id = ${org} and action = ${action}`))[0]?.n,
    );

  it("builds an install URL carrying a signed marker", () => {
    const url = new URL(buildInstallUrl(config, actorA()));
    expect(url.pathname).toBe("/apps/skillcanon-test/installations/new");
    expect(url.searchParams.get("state")).toContain(".");
  });

  it("records an installation once, replays return the same row, and audits it", async () => {
    const id = ghId();
    const first = await install(orgA, userA, id);
    const again = await install(orgA, userA, id);
    expect(again.id).toBe(first.id);
    expect(first).toMatchObject({ githubAccountLogin: "acme", githubAccountType: "Organization", organizationId: orgA });
    expect(await auditCount(orgA, "vcs_installation.created")).toBe(1);
  });

  it("rejects a missing, altered, expired or someone else's state and records nothing", async () => {
    const run = (state: string | null) =>
      withTenantContext(testDb.appDb, orgA, (tx) => completeInstall(tx, config, actorA(), { state, githubInstallationId: ghId() }, undefined, githubFetch()));
    await expect(run(null)).rejects.toThrow(/invalid or has expired/);
    await expect(run(signInstallState(actorA(), "wrong-secret"))).rejects.toThrow(/invalid or has expired/);
    await expect(run(signInstallState(actorA(), "whsec", Date.now() - 3_600_000))).rejects.toThrow(/invalid or has expired/);
    await expect(run(signInstallState({ organizationId: orgB, userId: userA }, "whsec"))).rejects.toThrow(/invalid or has expired/);
  });

  it("refuses an installation id that belongs to another organization", async () => {
    const id = ghId();
    await install(orgA, userA, id);
    await expect(install(orgB, randomUUID(), id)).rejects.toThrow(/different organization/);
  });

  it("lists only the caller's organization's active installations", async () => {
    await install(orgA, userA, ghId());
    await install(orgB, randomUUID(), ghId());
    const a = await withTenantContext(testDb.appDb, orgA, (tx) => listInstallations(tx, orgA));
    expect(a.length).toBe(1);
    expect(a[0]?.organizationId).toBe(orgA);
  });

  it("applies suspend, unsuspend and delete webhooks, auditing each, and a redelivery once", async () => {
    const id = ghId();
    const row = await install(orgA, userA, id);
    const get = async () => (await testDb.ownerDb.execute<{ suspended_at: Date | null; deleted_at: Date | null }>(sql`select suspended_at, deleted_at from vcs_integration.installations where id = ${row.id}`))[0]!;

    expect(await deliver(testDb.authDb, "installation", { action: "suspend", installation: { id } })).toEqual({ status: "handled" });
    expect((await get()).suspended_at).not.toBeNull();
    expect(await deliver(testDb.authDb, "installation", { action: "unsuspend", installation: { id } })).toEqual({ status: "handled" });
    expect((await get()).suspended_at).toBeNull();

    const deleteDelivery = randomUUID();
    await deliver(testDb.authDb, "installation", { action: "deleted", installation: { id } }, deleteDelivery);
    expect((await get()).deleted_at).not.toBeNull();
    expect(await deliver(testDb.authDb, "installation", { action: "deleted", installation: { id } }, deleteDelivery)).toEqual({ status: "duplicate" });
    expect(await auditCount(orgA, "vcs_installation.updated")).toBe(2);
    expect(await auditCount(orgA, "vcs_installation.deleted")).toBe(1);

    // soft delete: hidden from the list, row kept, no token
    expect(await withTenantContext(testDb.appDb, orgA, (tx) => listInstallations(tx, orgA))).toEqual([]);
    await expect(withTenantContext(testDb.appDb, orgA, (tx) => getInstallationAccessToken(tx, config, orgA, row.id, githubFetch()))).rejects.toThrow(/suspended, deleted, or unknown/);
  });

  it("rejects bad signatures and unconfigured instances without side effects, and ignores other events", async () => {
    const id = ghId();
    const row = await install(orgA, userA, id);
    expect(await deliver(testDb.authDb, "installation", { action: "deleted", installation: { id } }, randomUUID(), "wrong")).toEqual({ status: "rejected", reason: "bad-signature" });
    expect(await handleGithubWebhook(testDb.authDb, { rawBody: "{}", signatureHeader: null, deliveryId: "d", eventName: "installation" }, {})).toEqual({ status: "rejected", reason: "not-configured" });
    expect(await deliver(testDb.authDb, "pull_request", { action: "opened" })).toEqual({ status: "ignored" });
    expect(await deliver(testDb.authDb, "installation", { action: "deleted", installation: { id: ghId() } })).toEqual({ status: "ignored" });
    expect((await testDb.ownerDb.execute<{ deleted_at: Date | null }>(sql`select deleted_at from vcs_integration.installations where id = ${row.id}`))[0]?.deleted_at).toBeNull();
  });

  it("mints a token for an active installation", async () => {
    const row = await install(orgA, userA, ghId());
    expect(await withTenantContext(testDb.appDb, orgA, (tx) => getInstallationAccessToken(tx, config, orgA, row.id, githubFetch()))).toBe("ghs_x");
  });

  it("hides another organization's installation from the app role (RLS)", async () => {
    const row = await install(orgA, userA, ghId());
    await expect(withTenantContext(testDb.appDb, orgB, (tx) => getInstallationAccessToken(tx, config, orgB, row.id, githubFetch()))).rejects.toThrow(/suspended, deleted, or unknown/);
  });
});
