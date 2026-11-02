import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { startTestDb, type TestDb } from "@/shared/db/test-helpers";
import { withTenantContext } from "@/shared/db/tenant-context";
import { InvalidManagerError, ManagerCycleError, NotAuthorizedError, type UserSummary } from "../domain/user";
import { insert as insertOrg } from "../infrastructure/organizations-repo";
import { insert as insertTeam } from "../infrastructure/teams-repo";
import { findById } from "../infrastructure/users-repo";
import { createUser } from "./create-user";
import { getUser } from "./get-user";
import { insertValidatedUser } from "./insert-validated-user";
import { listUsers } from "./list-users";
import { updateUser } from "./update-user";

describe("reports-to (019/002)", () => {
  let testDb: TestDb;

  beforeAll(async () => {
    testDb = await startTestDb();
  }, 120_000);

  afterAll(async () => {
    await testDb.teardown();
  });

  async function org() {
    const { id: organizationId } = await insertOrg(testDb.authDb, { name: "Acme", slug: `acme-${randomUUID()}` });
    const { id: teamId } = await insertTeam(testDb.authDb, { organizationId, name: "Root", slug: `root-${randomUUID()}` });
    return { organizationId, teamId };
  }

  async function user(o: { organizationId: string; teamId: string }, name: string, role: "admin" | "member" = "member") {
    const { id } = await insertValidatedUser(testDb.authDb, {
      organizationId: o.organizationId,
      teamId: o.teamId,
      username: `${name}-${randomUUID()}`,
      displayName: name,
      email: `${name}-${randomUUID()}@example.com`,
      password: "password123",
      role,
    });
    const row = (await findById(testDb.authDb, id))!;
    return { id, summary: { id, orgId: row.organizationId, teamId: row.teamId, role, email: row.email } satisfies UserSummary };
  }

  it("sets, reads back and clears a manager, and audits the change", async () => {
    const o = await org();
    const admin = await user(o, "admin", "admin");
    const boss = await user(o, "boss");
    const report = await user(o, "report");

    await withTenantContext(testDb.appDb, o.organizationId, (tx) => updateUser(tx, admin.summary, report.id, { managerId: boss.id }));

    expect((await withTenantContext(testDb.appDb, o.organizationId, (tx) => getUser(tx, report.id, o.organizationId))).managerId).toBe(boss.id);
    const listed = await withTenantContext(testDb.appDb, o.organizationId, (tx) => listUsers(tx, admin.summary));
    expect(listed.find((u) => u.id === report.id)?.managerId).toBe(boss.id);
    const events = Array.from(
      await testDb.ownerDb.execute<{ after: { managerId: string | null } }>(
        sql`select after from audit.audit_events where organization_id = ${o.organizationId} and resource_id = ${report.id} and action = 'user.updated'`,
      ),
    );
    expect(events[0]?.after.managerId).toBe(boss.id);

    await withTenantContext(testDb.appDb, o.organizationId, (tx) => updateUser(tx, admin.summary, report.id, { managerId: null }));
    expect((await withTenantContext(testDb.appDb, o.organizationId, (tx) => getUser(tx, report.id, o.organizationId))).managerId).toBeNull();
  });

  it("rejects a reporting loop, direct or through others, naming it", async () => {
    const o = await org();
    const admin = await user(o, "admin", "admin");
    const a = await user(o, "Ann");
    const b = await user(o, "Bo");
    const c = await user(o, "Cy");
    await withTenantContext(testDb.appDb, o.organizationId, (tx) => updateUser(tx, admin.summary, b.id, { managerId: a.id }));
    await withTenantContext(testDb.appDb, o.organizationId, (tx) => updateUser(tx, admin.summary, c.id, { managerId: b.id }));

    const direct = withTenantContext(testDb.appDb, o.organizationId, (tx) => updateUser(tx, admin.summary, a.id, { managerId: b.id }));
    await expect(direct).rejects.toThrow(ManagerCycleError);
    await expect(direct).rejects.toThrow(/Ann → Bo → Ann/);
    await expect(withTenantContext(testDb.appDb, o.organizationId, (tx) => updateUser(tx, admin.summary, a.id, { managerId: c.id }))).rejects.toThrow(
      /Ann → Cy → Bo → Ann/,
    );
  });

  it("rejects self, an unknown person, someone from another organization, and a non-admin caller", async () => {
    const o = await org();
    const other = await org();
    const admin = await user(o, "admin", "admin");
    const member = await user(o, "member");
    const outsider = await user(other, "outsider");

    for (const managerId of [member.id, randomUUID(), outsider.id]) {
      await expect(withTenantContext(testDb.appDb, o.organizationId, (tx) => updateUser(tx, admin.summary, member.id, { managerId }))).rejects.toThrow(
        InvalidManagerError,
      );
    }
    await expect(
      withTenantContext(testDb.appDb, o.organizationId, (tx) => updateUser(tx, member.summary, member.id, { managerId: admin.id })),
    ).rejects.toThrow(NotAuthorizedError);
  });

  it("creates a user with a manager, and without one as before", async () => {
    const o = await org();
    const admin = await user(o, "admin", "admin");
    const boss = await user(o, "boss");

    const withManager = await withTenantContext(testDb.appDb, o.organizationId, (tx) =>
      createUser(tx, admin.summary, { teamId: o.teamId, username: `new-${randomUUID()}`, email: `new-${randomUUID()}@example.com`, password: "password123", managerId: boss.id }),
    );
    const without = await withTenantContext(testDb.appDb, o.organizationId, (tx) =>
      createUser(tx, admin.summary, { teamId: o.teamId, username: `plain-${randomUUID()}`, email: `plain-${randomUUID()}@example.com`, password: "password123" }),
    );

    expect((await findById(testDb.authDb, withManager.id))?.managerId).toBe(boss.id);
    expect((await findById(testDb.authDb, without.id))?.managerId).toBeNull();
    await expect(
      withTenantContext(testDb.appDb, o.organizationId, (tx) =>
        createUser(tx, admin.summary, { teamId: o.teamId, username: `bad-${randomUUID()}`, email: `bad-${randomUUID()}@example.com`, password: "password123", managerId: randomUUID() }),
      ),
    ).rejects.toThrow(InvalidManagerError);
  });
});
