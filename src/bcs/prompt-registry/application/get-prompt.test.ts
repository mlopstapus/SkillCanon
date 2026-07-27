import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { withTenantContext } from "@/shared/db/tenant-context";
import { startTestDb, type TestDb } from "@/shared/db/test-helpers";
import { getPrompt } from "./get-prompt";
import { createPromptInOrg, makePromptFixtureOrg } from "./prompt-test-helpers";

describe("getPrompt", () => {
  let testDb: TestDb;

  beforeAll(async () => {
    testDb = await startTestDb();
  }, 120_000);

  afterAll(async () => {
    await testDb.teardown();
  });

  it("returns a prompt that belongs to the caller's organization", async () => {
    const fixture = await makePromptFixtureOrg(testDb);
    const created = await createPromptInOrg(testDb, fixture, "my-prompt");

    const result = await withTenantContext(testDb.appDb, fixture.organizationId, (tx) =>
      getPrompt(tx, fixture.actor, "my-prompt"),
    );

    expect(result).not.toBeNull();
    expect(result?.id).toBe(created.id);
    expect(result?.organizationId).toBe(fixture.organizationId);
  });

  it("returns null for a prompt that does not exist in the caller's organization", async () => {
    const fixture = await makePromptFixtureOrg(testDb);

    // Create in another org fixture — same prompt name
    const otherFixture = await makePromptFixtureOrg(testDb);
    await createPromptInOrg(testDb, otherFixture, "isolation-test");

    const result = await withTenantContext(testDb.appDb, fixture.organizationId, (tx) =>
      getPrompt(tx, fixture.actor, "isolation-test"),
    );

    expect(result).toBeNull();
  });
});
