import { randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { startTestDb, type TestDb } from "@/shared/db/test-helpers";
import { withTenantContext } from "@/shared/db/tenant-context";
import { createOrganization } from "./create-organization";
import { createTeam } from "./create-team";
import { listTeams } from "./list-teams";

describe("listTeams", () => {
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

  it("lists every team in the organization, flat, at any depth (019-account-team-settings-ui)", async () => {
    const org = await testDb.authDb.transaction((tx) =>
      createOrganization(tx, { name: "org-flat", slug: `org-flat-${randomUUID()}` }),
    );
    const root = await withTenantContext(testDb.appDb, org.id, (tx) =>
      createTeam(tx, { organizationId: org.id, name: "Engineering", slug: "engineering" }),
    );
    await withTenantContext(testDb.appDb, org.id, (tx) =>
      createTeam(tx, {
        organizationId: org.id,
        name: "Platform",
        slug: "platform",
        parentTeamId: root.id,
      }),
    );

    const all = await withTenantContext(testDb.appDb, org.id, (tx) =>
      listTeams(tx, org.id),
    );

    expect(all.map((t) => t.name).sort()).toEqual(["Engineering", "Platform"]);
    const platform = all.find((t) => t.name === "Platform");
    expect(platform?.parentTeamId).toBe(root.id);
  });

  it("never returns another organization's teams", async () => {
    const orgA = await testDb.authDb.transaction((tx) =>
      createOrganization(tx, { name: "org-a", slug: `org-a-${randomUUID()}` }),
    );
    const orgB = await testDb.authDb.transaction((tx) =>
      createOrganization(tx, { name: "org-b", slug: `org-b-${randomUUID()}` }),
    );
    await withTenantContext(testDb.appDb, orgA.id, (tx) =>
      createTeam(tx, { organizationId: orgA.id, name: "A Team", slug: "a-team" }),
    );
    await withTenantContext(testDb.appDb, orgB.id, (tx) =>
      createTeam(tx, { organizationId: orgB.id, name: "B Team", slug: "b-team" }),
    );

    const all = await withTenantContext(testDb.appDb, orgA.id, (tx) =>
      listTeams(tx, orgA.id),
    );

    expect(all.map((t) => t.name)).toEqual(["A Team"]);
  });
});
