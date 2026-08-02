import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { withTenantContext } from "@/shared/db/tenant-context";
import { startTestDb, type TestDb } from "@/shared/db/test-helpers";
import { publishVersion } from "./publish-version";
import { getPromptVersion } from "./get-prompt-version";
import { createPromptInOrg, makePromptFixtureOrg } from "./prompt-test-helpers";

describe("getPromptVersion", () => {
  let testDb: TestDb;

  beforeAll(async () => {
    testDb = await startTestDb();
  }, 120_000);

  afterAll(async () => {
    await testDb.teardown();
  });

  it("returns the version for an id whose owning prompt is in the caller's organization", async () => {
    const fixture = await makePromptFixtureOrg(testDb);
    await createPromptInOrg(testDb, fixture, "versioned-prompt");

    const v = await withTenantContext(testDb.appDb, fixture.organizationId, (tx) =>
      publishVersion(tx, fixture.actor, {
        organizationId: fixture.organizationId,
        promptName: "versioned-prompt",
        version: "v1",
        systemTemplate: "Be helpful.",
        userTemplate: "{{input}}",
        inputSchema: {},
        tags: [],
      }),
    );

    await withTenantContext(testDb.appDb, fixture.organizationId, async (tx) => {
      await expect(
        getPromptVersion(tx, fixture.organizationId, v.id),
      ).resolves.toMatchObject({ id: v.id, version: "v1" });
    });
  });

  it("returns null for a nonexistent version id", async () => {
    const fixture = await makePromptFixtureOrg(testDb);

    await withTenantContext(testDb.appDb, fixture.organizationId, async (tx) => {
      await expect(
        getPromptVersion(tx, fixture.organizationId, randomUUID()),
      ).resolves.toBeNull();
    });
  });

  it("returns null (not the row) for a version whose owning prompt belongs to a different organization", async () => {
    const fixture = await makePromptFixtureOrg(testDb);
    await createPromptInOrg(testDb, fixture, "versioned-prompt-2");

    const v = await withTenantContext(testDb.appDb, fixture.organizationId, (tx) =>
      publishVersion(tx, fixture.actor, {
        organizationId: fixture.organizationId,
        promptName: "versioned-prompt-2",
        version: "v1",
        userTemplate: "{{input}}",
        inputSchema: {},
        tags: [],
      }),
    );

    await withTenantContext(testDb.appDb, fixture.otherOrgId, async (tx) => {
      await expect(
        getPromptVersion(tx, fixture.otherOrgId, v.id),
      ).resolves.toBeNull();
    });
  });
});
