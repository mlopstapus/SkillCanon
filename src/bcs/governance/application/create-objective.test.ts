import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { withTenantContext } from "@/shared/db/tenant-context";
import { startTestDb, type TestDb } from "@/shared/db/test-helpers";
import {
  InvalidObjectiveInputError,
  ObjectiveCycleError,
  ObjectiveParentNotFoundError,
  ObjectiveScopeNotFoundError,
} from "../domain/objective";
import { createObjective } from "./create-objective";
import {
  countObjectives,
  createTestObjective,
  makeObjectiveFixtureOrg,
  makeObjectiveScopeVerifier,
  makeVerifierForFixture,
  queryObjectiveAuditEvents,
  queryObjectiveRows,
} from "./objective-test-helpers";

describe("createObjective", () => {
  let testDb: TestDb;

  beforeAll(async () => {
    testDb = await startTestDb();
  }, 120_000);

  afterAll(async () => {
    await testDb.teardown();
  });

  it("creates an organization-only objective with defaults and one audit event", async () => {
    const fixture = await makeObjectiveFixtureOrg(testDb);

    const result = await withTenantContext(testDb.appDb, fixture.organizationId, (tx) =>
      createObjective(
        tx,
        fixture.actor,
        { title: "Improve reliability", description: "Quarterly focus" },
        makeObjectiveScopeVerifier([]),
        { transport: "api", sourceIp: "198.51.100.10" },
      ),
    );

    expect(result.organizationId).toBe(fixture.organizationId);
    expect(result.teamId).toBeNull();
    expect(result.projectId).toBeNull();
    expect(result.userId).toBeNull();
    expect(result.parentObjectiveId).toBeNull();
    expect(result.status).toBe("active");
    expect(result.isInherited).toBe(false);

    const rows = await queryObjectiveRows(testDb, sql`id = ${result.id}`);
    expect(rows).toHaveLength(1);
    const events = await queryObjectiveAuditEvents(
      testDb,
      fixture.organizationId,
      sql`action = 'objective.created' and resource_id = ${result.id}`,
    );
    expect(events).toHaveLength(1);
    expect(events[0]?.transport).toBe("api");
    expect(events[0]?.source_ip).toBe("198.51.100.10");
  });

  it("creates objectives with team, project, user, and combined scopes", async () => {
    const fixture = await makeObjectiveFixtureOrg(testDb);
    const verifier = makeVerifierForFixture(fixture);

    const team = await withTenantContext(testDb.appDb, fixture.organizationId, (tx) =>
      createObjective(tx, fixture.actor, { teamId: fixture.teamId, title: "Team goal" }, verifier),
    );
    const project = await withTenantContext(testDb.appDb, fixture.organizationId, (tx) =>
      createObjective(tx, fixture.actor, { projectId: fixture.projectId, title: "Project goal" }, verifier),
    );
    const user = await withTenantContext(testDb.appDb, fixture.organizationId, (tx) =>
      createObjective(tx, fixture.actor, { userId: fixture.userId, title: "User goal" }, verifier),
    );
    const combined = await withTenantContext(testDb.appDb, fixture.organizationId, (tx) =>
      createObjective(
        tx,
        fixture.actor,
        {
          teamId: fixture.teamId,
          projectId: fixture.projectId,
          userId: fixture.userId,
          title: "Shared goal",
        },
        verifier,
      ),
    );

    expect(team.teamId).toBe(fixture.teamId);
    expect(project.projectId).toBe(fixture.projectId);
    expect(user.userId).toBe(fixture.userId);
    expect(combined.teamId).toBe(fixture.teamId);
    expect(combined.projectId).toBe(fixture.projectId);
    expect(combined.userId).toBe(fixture.userId);
  });

  it("creates an objective under a same-organization parent", async () => {
    const fixture = await makeObjectiveFixtureOrg(testDb);
    const parent = await createTestObjective(testDb, fixture, { title: "Parent" });

    const child = await withTenantContext(testDb.appDb, fixture.organizationId, (tx) =>
      createObjective(
        tx,
        fixture.actor,
        { teamId: fixture.teamId, title: "Child", parentObjectiveId: parent.id },
        makeVerifierForFixture(fixture),
      ),
    );

    expect(child.parentObjectiveId).toBe(parent.id);
  });

  it("rejects blank titles without persisting or auditing", async () => {
    const fixture = await makeObjectiveFixtureOrg(testDb);
    const before = await countObjectives(testDb);
    const eventsBefore = await queryObjectiveAuditEvents(testDb, fixture.organizationId, sql`action = 'objective.created'`);

    await expect(
      withTenantContext(testDb.appDb, fixture.organizationId, (tx) =>
        createObjective(tx, fixture.actor, { title: "   " }, makeObjectiveScopeVerifier([])),
      ),
    ).rejects.toThrow(InvalidObjectiveInputError);

    expect(await countObjectives(testDb)).toBe(before);
    const eventsAfter = await queryObjectiveAuditEvents(testDb, fixture.organizationId, sql`action = 'objective.created'`);
    expect(eventsAfter).toHaveLength(eventsBefore.length);
  });

  it("rejects cross-organization team, project, and user scopes", async () => {
    const orgA = await makeObjectiveFixtureOrg(testDb);
    const orgB = await makeObjectiveFixtureOrg(testDb);
    const before = await countObjectives(testDb);
    const verifier = makeObjectiveScopeVerifier([
      { id: orgB.teamId, organizationId: orgB.organizationId },
      { id: orgB.projectId, organizationId: orgB.organizationId },
      { id: orgB.userId, organizationId: orgB.organizationId },
    ]);

    for (const params of [
      { teamId: orgB.teamId, title: "Cross team" },
      { projectId: orgB.projectId, title: "Cross project" },
      { userId: orgB.userId, title: "Cross user" },
    ]) {
      await expect(
        withTenantContext(testDb.appDb, orgA.organizationId, (tx) =>
          createObjective(tx, orgA.actor, params, verifier),
        ),
      ).rejects.toThrow(ObjectiveScopeNotFoundError);
    }

    expect(await countObjectives(testDb)).toBe(before);
  });

  it("rejects missing or cross-organization parent objectives", async () => {
    const orgA = await makeObjectiveFixtureOrg(testDb);
    const orgB = await makeObjectiveFixtureOrg(testDb);
    const orgBParent = await createTestObjective(testDb, orgB);
    const before = await countObjectives(testDb);

    await expect(
      withTenantContext(testDb.appDb, orgA.organizationId, (tx) =>
        createObjective(
          tx,
          orgA.actor,
          { title: "Missing parent", parentObjectiveId: randomUUID() },
          makeVerifierForFixture(orgA),
        ),
      ),
    ).rejects.toThrow(ObjectiveParentNotFoundError);

    await expect(
      withTenantContext(testDb.appDb, orgA.organizationId, (tx) =>
        createObjective(
          tx,
          orgA.actor,
          { title: "Cross parent", parentObjectiveId: orgBParent.id },
          makeVerifierForFixture(orgA),
        ),
      ),
    ).rejects.toThrow(ObjectiveParentNotFoundError);

    expect(await countObjectives(testDb)).toBe(before);
  });

  it("rejects create input that directly self-parents", async () => {
    const fixture = await makeObjectiveFixtureOrg(testDb);
    const before = await countObjectives(testDb);
    const objectiveId = randomUUID();

    await expect(
      withTenantContext(testDb.appDb, fixture.organizationId, (tx) =>
        createObjective(
          tx,
          fixture.actor,
          { id: objectiveId, title: "Self parent", parentObjectiveId: objectiveId },
          makeVerifierForFixture(fixture),
        ),
      ),
    ).rejects.toThrow(ObjectiveCycleError);

    expect(await countObjectives(testDb)).toBe(before);
  });
});
