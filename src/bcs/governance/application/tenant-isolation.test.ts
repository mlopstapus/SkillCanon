import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, it } from "vitest";
import { updateObjective } from "./update-objective";
import { getObjective } from "./get-objective";
import { updatePolicy } from "./update-policy";
import { getPolicy } from "./get-policy";
import {
  insertObjectiveRow,
  makeObjectiveFixtureOrg,
  makeObjectiveScopeVerifier,
} from "./objective-test-helpers";
import { insertPolicyRow, makePolicyFixtureOrg } from "./policy-test-helpers";
import { withTenantContext } from "@/shared/db/tenant-context";
import { startTestDb, type TestDb } from "@/shared/db/test-helpers";
import { assertCrossTenantDenied } from "@/shared/testing/tenant-isolation";

describe("governance tenant isolation", () => {
  let testDb: TestDb;

  beforeAll(async () => {
    testDb = await startTestDb();
  }, 120_000);

  afterAll(async () => {
    await testDb.teardown();
  });

  describe("policies", () => {
    it("denies cross-organization access by id via app-layer filters and RLS alone", async () => {
      const orgA = await makePolicyFixtureOrg(testDb);
      const orgB = await makePolicyFixtureOrg(testDb);
      const policyId = await insertPolicyRow(testDb, {
        organizationId: orgB.organizationId,
        teamId: orgB.teamId,
        name: "Org B policy",
      });

      await assertCrossTenantDenied({
        actingAsOrg: orgA.organizationId,
        resourceOwnedByOrg: orgB.organizationId,
        resourceId: policyId,
        fetchResourceById: (id) =>
          withTenantContext(testDb.appDb, orgA.organizationId, (tx) =>
            getPolicy(tx, orgA.actor, id),
          ),
      });

      await assertCrossTenantDenied({
        actingAsOrg: orgA.organizationId,
        resourceOwnedByOrg: orgB.organizationId,
        resourceId: policyId,
        fetchResourceById: (id) =>
          withTenantContext(testDb.appDb, orgA.organizationId, (tx) =>
            updatePolicy(tx, orgA.actor, id, { name: "Cross-org update" }),
          ),
      });

      await assertCrossTenantDenied({
        actingAsOrg: orgA.organizationId,
        resourceOwnedByOrg: orgB.organizationId,
        resourceId: policyId,
        fetchResourceById: (id) =>
          withTenantContext(testDb.appDb, orgA.organizationId, async (tx) =>
            Array.from(
              await tx.execute(sql`select id from governance.policies where id = ${id}`),
            ),
          ),
      });

      await assertCrossTenantDenied({
        actingAsOrg: orgA.organizationId,
        resourceOwnedByOrg: orgB.organizationId,
        resourceId: policyId,
        fetchResourceById: (id) =>
          withTenantContext(testDb.appDb, orgA.organizationId, async (tx) =>
            Array.from(
              await tx.execute(sql`
                update governance.policies
                set name = 'Cross-org update'
                where id = ${id}
                returning id
              `),
            ),
          ),
      });
    });
  });

  describe("objectives", () => {
    it("denies cross-organization access by id via app-layer filters and RLS alone", async () => {
      const orgA = await makeObjectiveFixtureOrg(testDb);
      const orgB = await makeObjectiveFixtureOrg(testDb);
      const objectiveId = await insertObjectiveRow(testDb, {
        organizationId: orgB.organizationId,
        teamId: orgB.teamId,
        title: "Org B objective",
      });

      await assertCrossTenantDenied({
        actingAsOrg: orgA.organizationId,
        resourceOwnedByOrg: orgB.organizationId,
        resourceId: objectiveId,
        fetchResourceById: (id) =>
          withTenantContext(testDb.appDb, orgA.organizationId, (tx) =>
            getObjective(tx, orgA.actor, id),
          ),
      });

      await assertCrossTenantDenied({
        actingAsOrg: orgA.organizationId,
        resourceOwnedByOrg: orgB.organizationId,
        resourceId: objectiveId,
        fetchResourceById: (id) =>
          withTenantContext(testDb.appDb, orgA.organizationId, (tx) =>
            updateObjective(
              tx,
              orgA.actor,
              id,
              { title: "Cross-org update" },
              makeObjectiveScopeVerifier([]),
            ),
          ),
      });

      await assertCrossTenantDenied({
        actingAsOrg: orgA.organizationId,
        resourceOwnedByOrg: orgB.organizationId,
        resourceId: objectiveId,
        fetchResourceById: (id) =>
          withTenantContext(testDb.appDb, orgA.organizationId, async (tx) =>
            Array.from(
              await tx.execute(sql`select id from governance.objectives where id = ${id}`),
            ),
          ),
      });

      await assertCrossTenantDenied({
        actingAsOrg: orgA.organizationId,
        resourceOwnedByOrg: orgB.organizationId,
        resourceId: objectiveId,
        fetchResourceById: (id) =>
          withTenantContext(testDb.appDb, orgA.organizationId, async (tx) =>
            Array.from(
              await tx.execute(sql`
                update governance.objectives
                set title = 'Cross-org update'
                where id = ${id}
                returning id
              `),
            ),
          ),
      });
    });
  });
});
