import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { withTenantContext } from "@/shared/db/tenant-context";
import { startTestDb, type TestDb } from "@/shared/db/test-helpers";
import { getPromptById } from "./get-prompt-by-id";
import { createPromptInOrg, makePromptFixtureOrg } from "./prompt-test-helpers";

describe("getPromptById", () => {
  let testDb: TestDb;

  beforeAll(async () => {
    testDb = await startTestDb();
  }, 120_000);

  afterAll(async () => {
    await testDb.teardown();
  });

  it("returns the prompt for an id in the caller's organization", async () => {
    const fixture = await makePromptFixtureOrg(testDb);
    const prompt = await createPromptInOrg(testDb, fixture, "pin-model-version");

    await withTenantContext(testDb.appDb, fixture.organizationId, async (tx) => {
      await expect(getPromptById(tx, fixture.organizationId, prompt.id)).resolves.toMatchObject({
        id: prompt.id,
        name: "pin-model-version",
      });
    });
  });

  it("returns null for a nonexistent prompt id", async () => {
    const fixture = await makePromptFixtureOrg(testDb);

    await withTenantContext(testDb.appDb, fixture.organizationId, async (tx) => {
      await expect(getPromptById(tx, fixture.organizationId, randomUUID())).resolves.toBeNull();
    });
  });

  it("returns null (not the row) for a prompt id belonging to a different organization", async () => {
    const fixture = await makePromptFixtureOrg(testDb);
    const prompt = await createPromptInOrg(testDb, fixture, "cross-org-prompt");

    await withTenantContext(testDb.appDb, fixture.otherOrgId, async (tx) => {
      await expect(getPromptById(tx, fixture.otherOrgId, prompt.id)).resolves.toBeNull();
    });
  });
});
