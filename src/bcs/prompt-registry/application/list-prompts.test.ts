import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { withTenantContext } from "@/shared/db/tenant-context";
import { startTestDb, type TestDb } from "@/shared/db/test-helpers";
import { listPrompts } from "./list-prompts";
import { createPromptInOrg, makePromptFixtureOrg } from "./prompt-test-helpers";

describe("listPrompts", () => {
  let testDb: TestDb;

  beforeAll(async () => {
    testDb = await startTestDb();
  }, 120_000);

  afterAll(async () => {
    await testDb.teardown();
  });

  it("returns prompts belonging to the caller's organization", async () => {
    const fixture = await makePromptFixtureOrg(testDb);
    const p1 = await createPromptInOrg(testDb, fixture, "alpha");
    const p2 = await createPromptInOrg(testDb, fixture, "beta");

    const result = await withTenantContext(testDb.appDb, fixture.organizationId, (tx) =>
      listPrompts(tx, fixture.actor),
    );

    const ids = result.map((p) => p.id);
    expect(ids).toContain(p1.id);
    expect(ids).toContain(p2.id);
    expect(result.every((p) => p.organizationId === fixture.organizationId)).toBe(true);
  });

  it("does not include prompts from other organizations", async () => {
    const fixtureA = await makePromptFixtureOrg(testDb);
    const fixtureB = await makePromptFixtureOrg(testDb);
    const otherPrompt = await createPromptInOrg(testDb, fixtureB, "other-org-prompt");

    const result = await withTenantContext(testDb.appDb, fixtureA.organizationId, (tx) =>
      listPrompts(tx, fixtureA.actor),
    );

    expect(result.map((p) => p.id)).not.toContain(otherPrompt.id);
  });
});
