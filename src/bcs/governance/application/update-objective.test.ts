import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { withTenantContext } from "@/shared/db/tenant-context";
import { startTestDb, type TestDb } from "@/shared/db/test-helpers";
import {
  InvalidObjectiveInputError,
  ObjectiveCycleError,
  ObjectiveNotFoundError,
  ObjectiveParentNotFoundError,
  ObjectiveScopeNotFoundError,
} from "../domain/objective";
import {
  createTestObjective,
  makeObjectiveFixtureOrg,
  makeObjectiveScopeVerifier,
  makeVerifierForFixture,
  queryObjectiveAuditEvents,
  queryObjectiveRows,
} from "./objective-test-helpers";
import { updateObjective } from "./update-objective";

describe("updateObjective", () => {
  let testDb: TestDb;

  beforeAll(async () => {
    testDb = await startTestDb();
  }, 120_000);

  afterAll(async () => {
    await testDb.teardown();
  });

  it("updates editable fields and records one audit event", async () => {
    const fixture = await makeObjectiveFixtureOrg(testDb);
    const created = await createTestObjective(testDb, fixture, { description: "Before" });

    const updated = await withTenantContext(testDb.appDb, fixture.organizationId, (tx) =>
      updateObjective(
        tx,
        fixture.actor,
        created.id,
        {
          title: "Updated objective",
          description: "After",
          status: "paused",
          projectId: fixture.projectId,
          userId: fixture.userId,
        },
        makeVerifierForFixture(fixture),
        { transport: "cli", sourceIp: null },
      ),
    );

    expect(updated.title).toBe("Updated objective");
    expect(updated.description).toBe("After");
    expect(updated.status).toBe("paused");
    expect(updated.teamId).toBe(created.teamId);
    expect(updated.projectId).toBe(fixture.projectId);
    expect(updated.userId).toBe(fixture.userId);

    const events = await queryObjectiveAuditEvents(
      testDb,
      fixture.organizationId,
      sql`action = 'objective.updated' and resource_id = ${created.id}`,
    );
    expect(events).toHaveLength(1);
    expect(events[0]?.transport).toBe("cli");
  });

  it("rejects blank title updates without auditing", async () => {
    const fixture = await makeObjectiveFixtureOrg(testDb);
    const created = await createTestObjective(testDb, fixture, { title: "Original" });
    const eventsBefore = await queryObjectiveAuditEvents(testDb, fixture.organizationId, sql`action = 'objective.updated'`);

    await expect(
      withTenantContext(testDb.appDb, fixture.organizationId, (tx) =>
        updateObjective(tx, fixture.actor, created.id, { title: "" }, makeVerifierForFixture(fixture)),
      ),
    ).rejects.toThrow(InvalidObjectiveInputError);

    const rows = await queryObjectiveRows(testDb, sql`id = ${created.id}`);
    expect(rows[0]?.title).toBe("Original");
    const eventsAfter = await queryObjectiveAuditEvents(testDb, fixture.organizationId, sql`action = 'objective.updated'`);
    expect(eventsAfter).toHaveLength(eventsBefore.length);
  });

  it("rejects cross-organization updates as not found", async () => {
    const orgA = await makeObjectiveFixtureOrg(testDb);
    const orgB = await makeObjectiveFixtureOrg(testDb);
    const created = await createTestObjective(testDb, orgB);

    await expect(
      withTenantContext(testDb.appDb, orgA.organizationId, (tx) =>
        updateObjective(tx, orgA.actor, created.id, { title: "Nope" }, makeVerifierForFixture(orgA)),
      ),
    ).rejects.toThrow(ObjectiveNotFoundError);
  });

  it("rejects cross-organization scope and parent updates without changing state", async () => {
    const orgA = await makeObjectiveFixtureOrg(testDb);
    const orgB = await makeObjectiveFixtureOrg(testDb);
    const created = await createTestObjective(testDb, orgA, { title: "Keep" });
    const orgBParent = await createTestObjective(testDb, orgB);
    const verifier = makeObjectiveScopeVerifier([
      { id: orgB.teamId, organizationId: orgB.organizationId },
      { id: orgB.projectId, organizationId: orgB.organizationId },
      { id: orgB.userId, organizationId: orgB.organizationId },
    ]);

    await expect(
      withTenantContext(testDb.appDb, orgA.organizationId, (tx) =>
        updateObjective(tx, orgA.actor, created.id, { teamId: orgB.teamId }, verifier),
      ),
    ).rejects.toThrow(ObjectiveScopeNotFoundError);
    await expect(
      withTenantContext(testDb.appDb, orgA.organizationId, (tx) =>
        updateObjective(tx, orgA.actor, created.id, { parentObjectiveId: orgBParent.id }, makeVerifierForFixture(orgA)),
      ),
    ).rejects.toThrow(ObjectiveParentNotFoundError);

    const rows = await queryObjectiveRows(testDb, sql`id = ${created.id}`);
    expect(rows[0]?.title).toBe("Keep");
    expect(rows[0]?.team_id).toBe(orgA.teamId);
    expect(rows[0]?.parent_objective_id).toBeNull();
  });

  it("allows valid parent moves and rejects self or descendant parent cycles", async () => {
    const fixture = await makeObjectiveFixtureOrg(testDb);
    const verifier = makeVerifierForFixture(fixture);
    const a = await createTestObjective(testDb, fixture, { title: "A" });
    const b = await createTestObjective(testDb, fixture, { title: "B", parentObjectiveId: a.id });
    const c = await createTestObjective(testDb, fixture, { title: "C", parentObjectiveId: b.id });
    const newParent = await createTestObjective(testDb, fixture, { title: "New parent" });

    const moved = await withTenantContext(testDb.appDb, fixture.organizationId, (tx) =>
      updateObjective(tx, fixture.actor, c.id, { parentObjectiveId: newParent.id }, verifier),
    );
    expect(moved.parentObjectiveId).toBe(newParent.id);

    await expect(
      withTenantContext(testDb.appDb, fixture.organizationId, (tx) =>
        updateObjective(tx, fixture.actor, b.id, { parentObjectiveId: b.id }, verifier),
      ),
    ).rejects.toThrow(ObjectiveCycleError);

    await withTenantContext(testDb.appDb, fixture.organizationId, (tx) =>
      updateObjective(tx, fixture.actor, c.id, { parentObjectiveId: b.id }, verifier),
    );
    await expect(
      withTenantContext(testDb.appDb, fixture.organizationId, (tx) =>
        updateObjective(tx, fixture.actor, a.id, { parentObjectiveId: c.id }, verifier),
      ),
    ).rejects.toThrow(ObjectiveCycleError);
  });
});
