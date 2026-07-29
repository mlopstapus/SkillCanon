import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { withTenantContext } from "@/shared/db/tenant-context";
import { startTestDb, type TestDb } from "@/shared/db/test-helpers";
import { createApiKey, type UserSummary } from "@/bcs/identity-access";
import { resolveActorDisplayName } from "./resolve-actor-display-name";

describe("resolveActorDisplayName", () => {
  let testDb: TestDb;

  beforeAll(async () => {
    testDb = await startTestDb();
  }, 120_000);

  afterAll(async () => {
    await testDb.teardown();
  });

  async function makeFixture() {
    const organizationId = randomUUID();
    const teamId = randomUUID();
    const adminId = randomUUID();
    const memberId = randomUUID();
    const orgSlug = `org-${randomUUID()}`;

    await testDb.ownerDb.execute(sql`
      insert into identity_access.organizations (id, name, slug)
      values (${organizationId}, ${`Org ${orgSlug}`}, ${orgSlug})
    `);
    await testDb.ownerDb.execute(sql`
      insert into identity_access.teams (id, organization_id, name, slug)
      values (${teamId}, ${organizationId}, 'Root', ${`team-${randomUUID()}`})
    `);
    await testDb.ownerDb.execute(sql`
      insert into identity_access.users (id, organization_id, team_id, username, display_name, email, role, is_active)
      values
        (${adminId}, ${organizationId}, ${teamId}, ${`admin-${randomUUID()}`}, 'Alice', ${`${randomUUID()}@example.com`}, 'admin', true),
        (${memberId}, ${organizationId}, ${teamId}, ${`member-${randomUUID()}`}, 'Bob', ${`${randomUUID()}@example.com`}, 'member', true)
    `);

    const admin: UserSummary = { id: adminId, orgId: organizationId, teamId, role: "admin", email: "" };
    return { organizationId, adminId, memberId, admin };
  }

  it("resolves a user actor's display name and role subtitle", async () => {
    const { organizationId, adminId, memberId } = await makeFixture();

    const actor = await withTenantContext(testDb.appDb, organizationId, (tx) =>
      resolveActorDisplayName(tx, organizationId, adminId, memberId, null),
    );

    expect(actor).toEqual({ kind: "user", id: memberId, displayName: "Bob", subtitle: "member" });
  });

  it("resolves an api-key actor's display name", async () => {
    const { organizationId, admin } = await makeFixture();
    const key = await withTenantContext(testDb.appDb, organizationId, (tx) =>
      createApiKey(tx, admin, { name: "skillcanon-cli", scopes: ["prompts:read"] }),
    );

    const actor = await withTenantContext(testDb.appDb, organizationId, (tx) =>
      resolveActorDisplayName(tx, organizationId, admin.id, null, key.id),
    );

    expect(actor).toEqual({ kind: "api_key", id: key.id, displayName: "skillcanon-cli", subtitle: "API key" });
  });

  it("returns a literal 'system' actor when both ids are null", async () => {
    const { organizationId, adminId } = await makeFixture();

    const actor = await withTenantContext(testDb.appDb, organizationId, (tx) =>
      resolveActorDisplayName(tx, organizationId, adminId, null, null),
    );

    expect(actor).toEqual({ kind: "system", id: null, displayName: "system", subtitle: "scheduled" });
  });

  it("falls back to the raw id for a departed user still referenced by historical events", async () => {
    const { organizationId, adminId } = await makeFixture();
    const departedUserId = randomUUID();

    const actor = await withTenantContext(testDb.appDb, organizationId, (tx) =>
      resolveActorDisplayName(tx, organizationId, adminId, departedUserId, null),
    );

    expect(actor).toEqual({
      kind: "user",
      id: departedUserId,
      displayName: departedUserId,
      subtitle: "unknown actor",
    });
  });
});
