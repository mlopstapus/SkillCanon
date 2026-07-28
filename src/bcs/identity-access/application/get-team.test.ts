import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { startTestDb, type TestDb } from "@/shared/db/test-helpers";
import { withTenantContext } from "@/shared/db/tenant-context";
import { insert as insertOrg } from "../infrastructure/organizations-repo";
import { getTeam } from "./get-team";
import { createTeam } from "./create-team";

describe("getTeam", () => {
  let testDb: TestDb;

  beforeAll(async () => {
    testDb = await startTestDb();
  }, 120_000);

  afterAll(async () => {
    await testDb.teardown();
  });

  it("returns the full team detail for a team in the caller's organization", async () => {
    const { id: organizationId } = await insertOrg(testDb.authDb, {
      name: "Acme",
      slug: `acme-${randomUUID()}`,
    });
    const { id: teamId } = await withTenantContext(testDb.appDb, organizationId, (tx) =>
      createTeam(tx, {
        organizationId,
        name: "Platform",
        slug: "platform",
        description: "Core platform services",
      }),
    );

    const team = await withTenantContext(testDb.appDb, organizationId, (tx) =>
      getTeam(tx, organizationId, teamId),
    );

    expect(team).toMatchObject({
      id: teamId,
      name: "Platform",
      slug: "platform",
      description: "Core platform services",
      parentTeamId: null,
    });
  });

  it("rejects a team id belonging to a different organization the same way a nonexistent id would (M3)", async () => {
    const { id: orgA } = await insertOrg(testDb.authDb, {
      name: "Org A",
      slug: `org-a-${randomUUID()}`,
    });
    const { id: orgB } = await insertOrg(testDb.authDb, {
      name: "Org B",
      slug: `org-b-${randomUUID()}`,
    });
    const { id: teamId } = await withTenantContext(testDb.appDb, orgB, (tx) =>
      createTeam(tx, { organizationId: orgB, name: "B Team", slug: "b-team" }),
    );

    await expect(
      withTenantContext(testDb.appDb, orgA, (tx) => getTeam(tx, orgA, teamId)),
    ).rejects.toThrow();
  });
});
