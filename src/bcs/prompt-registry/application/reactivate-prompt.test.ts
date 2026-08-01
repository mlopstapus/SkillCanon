import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { withTenantContext } from "@/shared/db/tenant-context";
import { startTestDb, type TestDb } from "@/shared/db/test-helpers";
import { PromptNotFoundError } from "../domain/prompt";
import { deprecatePrompt } from "./deprecate-prompt";
import { createPromptInOrg, makePromptFixtureOrg, queryPromptAuditEvents } from "./prompt-test-helpers";
import { reactivatePrompt } from "./reactivate-prompt";

describe("reactivatePrompt", () => {
  let testDb: TestDb;

  beforeAll(async () => {
    testDb = await startTestDb();
  }, 120_000);

  afterAll(async () => {
    await testDb.teardown();
  });

  it("clears a prompt's deprecated flag within the caller's organization", async () => {
    const fixture = await makePromptFixtureOrg(testDb);
    await createPromptInOrg(testDb, fixture, "to-reactivate");
    await withTenantContext(testDb.appDb, fixture.organizationId, (tx) =>
      deprecatePrompt(tx, fixture.actor, "to-reactivate"),
    );

    const result = await withTenantContext(testDb.appDb, fixture.organizationId, (tx) =>
      reactivatePrompt(tx, fixture.actor, "to-reactivate"),
    );

    expect(result.isDeprecated).toBe(false);
  });

  it("records a prompt.reactivated audit event", async () => {
    const fixture = await makePromptFixtureOrg(testDb);
    const prompt = await createPromptInOrg(testDb, fixture, "audited-reactivate");
    await withTenantContext(testDb.appDb, fixture.organizationId, (tx) =>
      deprecatePrompt(tx, fixture.actor, "audited-reactivate"),
    );

    await withTenantContext(testDb.appDb, fixture.organizationId, (tx) =>
      reactivatePrompt(tx, fixture.actor, "audited-reactivate", {
        transport: "api",
        sourceIp: "198.51.100.10",
      }),
    );

    const events = await queryPromptAuditEvents(
      testDb,
      sql`action = 'prompt.reactivated' and resource_id = ${prompt.id}`,
    );
    expect(events).toHaveLength(1);
    expect(events[0]?.transport).toBe("api");
    expect(events[0]?.source_ip).toBe("198.51.100.10");
  });

  it("does not affect a prompt in another organization with the same name", async () => {
    const fixtureA = await makePromptFixtureOrg(testDb);
    const fixtureB = await makePromptFixtureOrg(testDb);
    await createPromptInOrg(testDb, fixtureA, "shared-name");
    const promptB = await createPromptInOrg(testDb, fixtureB, "shared-name");
    await withTenantContext(testDb.appDb, fixtureB.organizationId, (tx) =>
      deprecatePrompt(tx, fixtureB.actor, "shared-name"),
    );

    await withTenantContext(testDb.appDb, fixtureA.organizationId, (tx) =>
      reactivatePrompt(tx, fixtureA.actor, "shared-name"),
    );

    const rows = await testDb.ownerDb.execute<{ is_deprecated: boolean }>(
      sql`select is_deprecated from prompt_registry.prompts where id = ${promptB.id}`,
    );
    expect(Array.from(rows)[0]?.is_deprecated).toBe(true);
  });

  it("rejects reactivating a prompt that does not exist in the caller's organization", async () => {
    const fixture = await makePromptFixtureOrg(testDb);
    const otherFixture = await makePromptFixtureOrg(testDb);
    await createPromptInOrg(testDb, otherFixture, "other-org-prompt");

    await expect(
      withTenantContext(testDb.appDb, fixture.organizationId, (tx) =>
        reactivatePrompt(tx, fixture.actor, "other-org-prompt"),
      ),
    ).rejects.toBeInstanceOf(PromptNotFoundError);
  });
});
