import { randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { startTestDb, type TestDb } from "@/shared/db/test-helpers";
import { withTenantContext } from "@/shared/db/tenant-context";
import type { UserSummary } from "../domain/user";
import { NotAuthorizedError } from "../domain/user";
import { createOrganization } from "./create-organization";
import { createTeam } from "./create-team";
import { getTeamChain } from "./get-team-chain";
import { reparentTeam } from "./reparent-team";
import { CycleError } from "../domain/team";
import { teams } from "../infrastructure/schema";
import { eq, sql } from "drizzle-orm";

function fakeUser(orgId: string, role: "admin" | "member"): UserSummary {
  return { id: randomUUID(), orgId, teamId: null, role, email: "acting@example.com" };
}

describe("reparentTeam", () => {
  let testDb: TestDb;

  beforeAll(async () => {
    testDb = await startTestDb();
  }, 120_000);

  beforeEach(() => {
    vi.stubEnv("STRIPE_ENABLED", "true");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  afterAll(async () => {
    await testDb.teardown();
  });

  async function makeOrg(name: string) {
    return testDb.authDb.transaction((tx) =>
      createOrganization(tx, { name, slug: `${name}-${randomUUID()}` }),
    );
  }

  it("rejects reparenting under a team from a different organization, no row changes", async () => {
    const orgA = await makeOrg("org-a-reparent");
    const orgB = await makeOrg("org-b-reparent");
    const teamA = await withTenantContext(testDb.appDb, orgA.id, (tx) =>
      createTeam(tx, { organizationId: orgA.id, name: "Team A", slug: "team-a" }),
    );
    const teamB = await withTenantContext(testDb.appDb, orgB.id, (tx) =>
      createTeam(tx, { organizationId: orgB.id, name: "Team B", slug: "team-b" }),
    );

    // Under real RLS (011-tenant-isolation-rls), a session scoped to orgA
    // simply can't see teamB's row at all — reparentTeam's own explicit
    // CrossOrgReparentError branch (for "found, but wrong org") never runs;
    // its earlier "not found" branch fires instead. Still a rejection, still
    // no row change — RLS getting there first is the M2 backstop working,
    // not a bug (research.md §6a-adjacent finding, tracked for T044's audit).
    await expect(
      withTenantContext(testDb.appDb, orgA.id, (tx) =>
        reparentTeam(tx, teamA.id, teamB.id, fakeUser(orgA.id, "admin")),
      ),
    ).rejects.toThrow();

    const [row] = await withTenantContext(testDb.appDb, orgA.id, (tx) =>
      tx.select().from(teams).where(eq(teams.id, teamA.id)),
    );
    expect(row?.parentTeamId).toBeNull();
  });

  it("rejects a reparent that would create a cycle, no row changes", async () => {
    const org = await makeOrg("org-cycle");
    const x = await withTenantContext(testDb.appDb, org.id, (tx) =>
      createTeam(tx, { organizationId: org.id, name: "X", slug: "x" }),
    );
    const y = await withTenantContext(testDb.appDb, org.id, (tx) =>
      createTeam(tx, { organizationId: org.id, name: "Y", slug: "y", parentTeamId: x.id }),
    );

    // X is Y's parent; reparenting X under Y would create a cycle.
    await expect(
      withTenantContext(testDb.appDb, org.id, (tx) =>
        reparentTeam(tx, x.id, y.id, fakeUser(org.id, "admin")),
      ),
    ).rejects.toThrow(CycleError);

    const [row] = await withTenantContext(testDb.appDb, org.id, (tx) =>
      tx.select().from(teams).where(eq(teams.id, x.id)),
    );
    expect(row?.parentTeamId).toBeNull();
  });

  it("a valid reparent succeeds and getTeamChain reflects the new lineage immediately", async () => {
    const org = await makeOrg("org-valid-reparent");
    const oldParent = await withTenantContext(testDb.appDb, org.id, (tx) =>
      createTeam(tx, { organizationId: org.id, name: "Old Parent", slug: "old-parent" }),
    );
    const newParent = await withTenantContext(testDb.appDb, org.id, (tx) =>
      createTeam(tx, { organizationId: org.id, name: "New Parent", slug: "new-parent" }),
    );
    const child = await withTenantContext(testDb.appDb, org.id, (tx) =>
      createTeam(tx, {
        organizationId: org.id,
        name: "Child",
        slug: "child",
        parentTeamId: oldParent.id,
      }),
    );

    await withTenantContext(testDb.appDb, org.id, (tx) =>
      reparentTeam(tx, child.id, newParent.id, fakeUser(org.id, "admin")),
    );

    const chain = await withTenantContext(testDb.appDb, org.id, (tx) =>
      getTeamChain(tx, org.id, child.id),
    );
    expect(chain.map((e) => e.name)).toEqual(["Child", "New Parent"]);
  });

  it("reparenting to the team's own current parent succeeds as a no-op", async () => {
    const org = await makeOrg("org-noop-reparent");
    const parent = await withTenantContext(testDb.appDb, org.id, (tx) =>
      createTeam(tx, { organizationId: org.id, name: "Parent", slug: "parent" }),
    );
    const child = await withTenantContext(testDb.appDb, org.id, (tx) =>
      createTeam(tx, {
        organizationId: org.id,
        name: "Child",
        slug: "child",
        parentTeamId: parent.id,
      }),
    );

    await expect(
      withTenantContext(testDb.appDb, org.id, (tx) =>
        reparentTeam(tx, child.id, parent.id, fakeUser(org.id, "admin")),
      ),
    ).resolves.not.toThrow();

    const [row] = await withTenantContext(testDb.appDb, org.id, (tx) =>
      tx.select().from(teams).where(eq(teams.id, child.id)),
    );
    expect(row?.parentTeamId).toBe(parent.id);
  });

  it("under two concurrent reparents that would jointly create a cycle, exactly one succeeds", async () => {
    const org = await makeOrg("org-concurrent-cycle");
    const a = await withTenantContext(testDb.appDb, org.id, (tx) =>
      createTeam(tx, { organizationId: org.id, name: "A", slug: "a" }),
    );
    const b = await withTenantContext(testDb.appDb, org.id, (tx) =>
      createTeam(tx, { organizationId: org.id, name: "B", slug: "b" }),
    );

    const results = await Promise.allSettled([
      withTenantContext(testDb.appDb, org.id, (tx) =>
        reparentTeam(tx, a.id, b.id, fakeUser(org.id, "admin")),
      ),
      withTenantContext(testDb.appDb, org.id, (tx) =>
        reparentTeam(tx, b.id, a.id, fakeUser(org.id, "admin")),
      ),
    ]);

    const fulfilled = results.filter((r) => r.status === "fulfilled");
    const rejected = results.filter((r) => r.status === "rejected");
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect((rejected[0] as PromiseRejectedResult).reason).toBeInstanceOf(CycleError);
  });

  it("rejects a non-admin actingUser (019-account-team-settings-ui)", async () => {
    const org = await makeOrg("org-reparent-nonadmin");
    const parent = await withTenantContext(testDb.appDb, org.id, (tx) =>
      createTeam(tx, { organizationId: org.id, name: "Parent", slug: "np-parent" }),
    );
    const child = await withTenantContext(testDb.appDb, org.id, (tx) =>
      createTeam(tx, { organizationId: org.id, name: "Child", slug: "np-child" }),
    );

    await expect(
      withTenantContext(testDb.appDb, org.id, (tx) =>
        reparentTeam(tx, child.id, parent.id, fakeUser(org.id, "member")),
      ),
    ).rejects.toThrow(NotAuthorizedError);
  });

  it("records exactly one team.reparented audit event on success", async () => {
    const org = await makeOrg("org-audited-reparent");
    const parent = await withTenantContext(testDb.appDb, org.id, (tx) =>
      createTeam(tx, { organizationId: org.id, name: "Parent", slug: "audit-parent" }),
    );
    const child = await withTenantContext(testDb.appDb, org.id, (tx) =>
      createTeam(tx, { organizationId: org.id, name: "Child", slug: "audit-child" }),
    );

    await withTenantContext(testDb.appDb, org.id, (tx) =>
      reparentTeam(tx, child.id, parent.id, fakeUser(org.id, "admin"), {
        auditContext: { transport: "web", sourceIp: "203.0.113.77" },
      }),
    );

    const rows = await testDb.appDb.execute<{
      action: string;
      resource_id: string | null;
      transport: string;
      source_ip: string | null;
    }>(
      sql`select action, resource_id, transport, source_ip from audit.audit_events where resource_id = ${child.id} and action = 'team.reparented'`,
    );

    expect(Array.from(rows)).toEqual([
      {
        action: "team.reparented",
        resource_id: child.id,
        transport: "web",
        source_ip: "203.0.113.77",
      },
    ]);
  });

});
