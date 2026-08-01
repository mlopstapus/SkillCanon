import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { withTenantContext } from "@/shared/db/tenant-context";
import { startTestDb, type TestDb } from "@/shared/db/test-helpers";
import { makeProjectIdentityVerifier } from "./project-identity-verifier";

describe("makeProjectIdentityVerifier", () => {
  let testDb: TestDb;
  let organizationId: string;
  let teamId: string;
  let userId: string;

  beforeAll(async () => {
    testDb = await startTestDb();
    organizationId = randomUUID();
    teamId = randomUUID();
    userId = randomUUID();
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
      values (${userId}, ${organizationId}, ${teamId}, ${`user-${randomUUID()}`}, 'Actor', ${`${randomUUID()}@example.com`}, 'admin', true)
    `);
  }, 120_000);

  afterAll(async () => {
    await testDb.teardown();
  });

  it("confirms a real organization, team, and user, and rejects nonexistent ones", async () => {
    await withTenantContext(testDb.appDb, organizationId, async (tx) => {
      const verifier = makeProjectIdentityVerifier(tx);

      await expect(verifier.organizationExists(organizationId)).resolves.toBe(true);
      await expect(verifier.organizationExists(randomUUID())).resolves.toBe(false);

      await expect(verifier.teamBelongsToOrganization(organizationId, teamId)).resolves.toBe(true);
      await expect(verifier.teamBelongsToOrganization(organizationId, randomUUID())).resolves.toBe(false);

      await expect(verifier.userBelongsToOrganization(organizationId, userId)).resolves.toBe(true);
      await expect(verifier.userBelongsToOrganization(organizationId, randomUUID())).resolves.toBe(false);
    });
  });
});
