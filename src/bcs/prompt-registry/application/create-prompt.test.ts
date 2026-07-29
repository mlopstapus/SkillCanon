import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { withTenantContext } from "@/shared/db/tenant-context";
import { startTestDb, type TestDb } from "@/shared/db/test-helpers";
import { DuplicatePromptNameError } from "../domain/prompt";
import { createPrompt } from "./create-prompt";
import { makePromptFixtureOrg, queryPromptAuditEvents, queryPromptRows } from "./prompt-test-helpers";

describe("createPrompt", () => {
  let testDb: TestDb;

  beforeAll(async () => {
    testDb = await startTestDb();
  }, 120_000);

  afterAll(async () => {
    await testDb.teardown();
  });

  it("creates a prompt and records one audit event", async () => {
    const fixture = await makePromptFixtureOrg(testDb);

    const result = await withTenantContext(testDb.appDb, fixture.organizationId, (tx) =>
      createPrompt(
        tx,
        fixture.actor,
        { organizationId: fixture.organizationId, name: "my-prompt" },
        { transport: "api", sourceIp: "198.51.100.8" },
      ),
    );

    expect(result.organizationId).toBe(fixture.organizationId);
    expect(result.name).toBe("my-prompt");
    expect(result.isDeprecated).toBe(false);
    expect(result.activeVersionId).toBeNull();

    const rows = await queryPromptRows(testDb, sql`id = ${result.id}`);
    expect(rows).toHaveLength(1);

    const events = await queryPromptAuditEvents(
      testDb,
      sql`action = 'prompt.created' and resource_id = ${result.id}`,
    );
    expect(events).toHaveLength(1);
    expect(events[0]?.transport).toBe("api");
    expect(events[0]?.source_ip).toBe("198.51.100.8");
  });

  it("allows two different organizations to each have a prompt with the same name", async () => {
    const fixtureA = await makePromptFixtureOrg(testDb);
    const fixtureB = await makePromptFixtureOrg(testDb);

    const resultA = await withTenantContext(testDb.appDb, fixtureA.organizationId, (tx) =>
      createPrompt(tx, fixtureA.actor, { organizationId: fixtureA.organizationId, name: "commit" }),
    );
    const resultB = await withTenantContext(testDb.appDb, fixtureB.organizationId, (tx) =>
      createPrompt(tx, fixtureB.actor, { organizationId: fixtureB.organizationId, name: "commit" }),
    );

    expect(resultA.name).toBe("commit");
    expect(resultB.name).toBe("commit");
    expect(resultA.organizationId).not.toBe(resultB.organizationId);
  });

  it("rejects a duplicate prompt name within the same organization", async () => {
    const fixture = await makePromptFixtureOrg(testDb);
    const name = `dupe-${randomUUID()}`;

    await withTenantContext(testDb.appDb, fixture.organizationId, (tx) =>
      createPrompt(tx, fixture.actor, { organizationId: fixture.organizationId, name }),
    );

    await expect(
      withTenantContext(testDb.appDb, fixture.organizationId, (tx) =>
        createPrompt(tx, fixture.actor, { organizationId: fixture.organizationId, name }),
      ),
    ).rejects.toBeInstanceOf(DuplicatePromptNameError);
  });

  it("always owns a newly created prompt by the creating user (PDR-016)", async () => {
    const fixture = await makePromptFixtureOrg(testDb);

    const result = await withTenantContext(testDb.appDb, fixture.organizationId, (tx) =>
      createPrompt(tx, fixture.actor, {
        organizationId: fixture.organizationId,
        name: `owner-prompt-${randomUUID()}`,
      }),
    );

    expect(result.ownerType).toBe("user");
    expect(result.ownerId).toBe(fixture.actorUserId);
    expect(result.forkedFromSkillId).toBeNull();
  });
});
