import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { withTenantContext } from "@/shared/db/tenant-context";
import { startTestDb, type TestDb } from "@/shared/db/test-helpers";
import { PromptNotFoundError } from "../domain/prompt";
import { deprecatePrompt } from "./deprecate-prompt";
import { createPromptInOrg, makePromptFixtureOrg } from "./prompt-test-helpers";

describe("deprecatePrompt", () => {
  let testDb: TestDb;

  beforeAll(async () => {
    testDb = await startTestDb();
  }, 120_000);

  afterAll(async () => {
    await testDb.teardown();
  });

  it("marks a prompt as deprecated within the caller's organization", async () => {
    const fixture = await makePromptFixtureOrg(testDb);
    await createPromptInOrg(testDb, fixture, "to-deprecate");

    const result = await withTenantContext(testDb.appDb, fixture.organizationId, (tx) =>
      deprecatePrompt(tx, fixture.actor, "to-deprecate"),
    );

    expect(result.isDeprecated).toBe(true);
  });

  it("does not affect a prompt in another organization with the same name", async () => {
    const fixtureA = await makePromptFixtureOrg(testDb);
    const fixtureB = await makePromptFixtureOrg(testDb);

    // Both orgs have a prompt named "shared-name"
    await createPromptInOrg(testDb, fixtureA, "shared-name");
    const promptB = await createPromptInOrg(testDb, fixtureB, "shared-name");

    // Org A deprecates theirs
    await withTenantContext(testDb.appDb, fixtureA.organizationId, (tx) =>
      deprecatePrompt(tx, fixtureA.actor, "shared-name"),
    );

    // Org B's prompt should remain non-deprecated
    const rows = await testDb.ownerDb.execute<{ is_deprecated: boolean }>(
      sql`select is_deprecated from prompt_registry.prompts where id = ${promptB.id}`,
    );
    expect(Array.from(rows)[0]?.is_deprecated).toBe(false);
  });

  it("rejects deprecating a prompt that does not exist in the caller's organization", async () => {
    const fixture = await makePromptFixtureOrg(testDb);
    const otherFixture = await makePromptFixtureOrg(testDb);

    // Create in other org
    await createPromptInOrg(testDb, otherFixture, "other-org-prompt");

    // Try to deprecate from caller's org — should fail
    await expect(
      withTenantContext(testDb.appDb, fixture.organizationId, (tx) =>
        deprecatePrompt(tx, fixture.actor, "other-org-prompt"),
      ),
    ).rejects.toBeInstanceOf(PromptNotFoundError);
  });
});

