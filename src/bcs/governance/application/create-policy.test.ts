import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { withTenantContext } from "@/shared/db/tenant-context";
import { startTestDb, type TestDb } from "@/shared/db/test-helpers";
import { InvalidPolicyScopeError, PolicyScopeNotFoundError } from "../domain/policy";
import { createPolicy } from "./create-policy";
import {
  countPolicies,
  makePolicyFixtureOrg,
  makeScopeVerifier,
  queryPolicyAuditEvents,
  queryPolicyRows,
} from "./policy-test-helpers";

describe("createPolicy", () => {
  let testDb: TestDb;

  beforeAll(async () => {
    testDb = await startTestDb();
  }, 120_000);

  afterAll(async () => {
    await testDb.teardown();
  });

  it("creates an active team-scoped policy and records one audit event", async () => {
    const fixture = await makePolicyFixtureOrg(testDb);
    const verifier = makeScopeVerifier([{ id: fixture.teamId, organizationId: fixture.organizationId }]);

    const result = await withTenantContext(testDb.appDb, fixture.organizationId, (tx) =>
      createPolicy(
        tx,
        fixture.actor,
        {
          teamId: fixture.teamId,
          name: "Require tests",
          description: "Engineering standard",
          enforcementType: "prepend",
          content: "All code must include tests.",
          priority: 10,
        },
        verifier,
        { transport: "api", sourceIp: "198.51.100.10" },
      ),
    );

    expect(result.teamId).toBe(fixture.teamId);
    expect(result.projectId).toBeNull();
    expect(result.isActive).toBe(true);
    const rows = await queryPolicyRows(testDb, sql`id = ${result.id}`);
    expect(rows).toHaveLength(1);
    const events = await queryPolicyAuditEvents(
      testDb,
      sql`action = 'policy.created' and resource_id = ${result.id}`,
    );
    expect(events).toHaveLength(1);
    expect(events[0]?.transport).toBe("api");
    expect(events[0]?.source_ip).toBe("198.51.100.10");
  });

  it("creates an active project-scoped policy", async () => {
    const fixture = await makePolicyFixtureOrg(testDb);
    const verifier = makeScopeVerifier([{ id: fixture.projectId, organizationId: fixture.organizationId }]);

    const result = await withTenantContext(testDb.appDb, fixture.organizationId, (tx) =>
      createPolicy(
        tx,
        fixture.actor,
        {
          projectId: fixture.projectId,
          name: "Validate output",
          enforcementType: "validate",
          content: "Must cite sources.",
          priority: 7,
        },
        verifier,
      ),
    );

    expect(result.projectId).toBe(fixture.projectId);
    expect(result.teamId).toBeNull();
    expect(result.enforcementType).toBe("validate");
  });

  it("rejects creation with both team and project scopes without persisting or auditing", async () => {
    const fixture = await makePolicyFixtureOrg(testDb);
    const before = await countPolicies(testDb);
    const eventsBefore = await queryPolicyAuditEvents(testDb, sql`action = 'policy.created'`);
    const verifier = makeScopeVerifier([
      { id: fixture.teamId, organizationId: fixture.organizationId },
      { id: fixture.projectId, organizationId: fixture.organizationId },
    ]);

    await expect(
      withTenantContext(testDb.appDb, fixture.organizationId, (tx) =>
        createPolicy(
          tx,
          fixture.actor,
          {
            teamId: fixture.teamId,
            projectId: fixture.projectId,
            name: "Ambiguous",
            enforcementType: "append",
            content: "No ambiguity.",
          },
          verifier,
        ),
      ),
    ).rejects.toThrow(InvalidPolicyScopeError);

    expect(await countPolicies(testDb)).toBe(before);
    const eventsAfter = await queryPolicyAuditEvents(testDb, sql`action = 'policy.created'`);
    expect(eventsAfter).toHaveLength(eventsBefore.length);
  });

  it("rejects creation with neither team nor project scope", async () => {
    const fixture = await makePolicyFixtureOrg(testDb);
    const before = await countPolicies(testDb);

    await expect(
      withTenantContext(testDb.appDb, fixture.organizationId, (tx) =>
        createPolicy(
          tx,
          fixture.actor,
          {
            name: "Unscoped",
            enforcementType: "inject",
            content: "No scope.",
          },
          makeScopeVerifier([]),
        ),
      ),
    ).rejects.toThrow(InvalidPolicyScopeError);

    expect(await countPolicies(testDb)).toBe(before);
  });

  it("rejects creation when the supplied scope belongs to another organization", async () => {
    const orgA = await makePolicyFixtureOrg(testDb);
    const orgB = await makePolicyFixtureOrg(testDb);
    const before = await countPolicies(testDb);
    const verifier = makeScopeVerifier([{ id: orgB.teamId, organizationId: orgB.organizationId }]);

    await expect(
      withTenantContext(testDb.appDb, orgA.organizationId, (tx) =>
        createPolicy(
          tx,
          orgA.actor,
          {
            teamId: orgB.teamId,
            name: "Cross org",
            enforcementType: "prepend",
            content: "Wrong org.",
          },
          verifier,
        ),
      ),
    ).rejects.toThrow(PolicyScopeNotFoundError);

    expect(await countPolicies(testDb)).toBe(before);
  });
});
