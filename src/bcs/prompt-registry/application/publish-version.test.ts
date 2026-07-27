import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { withTenantContext } from "@/shared/db/tenant-context";
import { startTestDb, type TestDb } from "@/shared/db/test-helpers";
import {
  DuplicatePromptVersionError,
  PromptNotFoundError,
} from "../domain/prompt";
import { publishVersion } from "./publish-version";
import {
  createPromptInOrg,
  makePromptFixtureOrg,
  queryPromptAuditEvents,
  queryPromptVersionRows,
} from "./prompt-test-helpers";

describe("publishVersion", () => {
  let testDb: TestDb;

  beforeAll(async () => {
    testDb = await startTestDb();
  }, 120_000);

  afterAll(async () => {
    await testDb.teardown();
  });

  it("publishes a version and records a PromptVersionPublished audit event", async () => {
    const fixture = await makePromptFixtureOrg(testDb);
    await createPromptInOrg(testDb, fixture, "versioned-prompt");

    const v = await withTenantContext(testDb.appDb, fixture.organizationId, (tx) =>
      publishVersion(
        tx,
        fixture.actor,
        {
          organizationId: fixture.organizationId,
          promptName: "versioned-prompt",
          version: "v1",
          systemTemplate: "Be helpful.",
          userTemplate: "{{input}}",
          inputSchema: { type: "object" },
          tags: ["production"],
        },
        { transport: "api", sourceIp: "10.0.0.1" },
      ),
    );

    expect(v.version).toBe("v1");
    expect(v.systemTemplate).toBe("Be helpful.");
    expect(v.tags).toEqual(["production"]);

    const events = await queryPromptAuditEvents(
      testDb,
      sql`action = 'prompt_version.published' and resource_id = ${v.id}`,
    );
    expect(events).toHaveLength(1);
    expect(events[0]?.transport).toBe("api");
  });

  it("advances active_version_id to the latest published version", async () => {
    const fixture = await makePromptFixtureOrg(testDb);
    await createPromptInOrg(testDb, fixture, "advance-test");

    const v1 = await withTenantContext(testDb.appDb, fixture.organizationId, (tx) =>
      publishVersion(tx, fixture.actor, {
        organizationId: fixture.organizationId,
        promptName: "advance-test",
        version: "v1",
      }),
    );
    const v2 = await withTenantContext(testDb.appDb, fixture.organizationId, (tx) =>
      publishVersion(tx, fixture.actor, {
        organizationId: fixture.organizationId,
        promptName: "advance-test",
        version: "v2",
      }),
    );

    // v1 row is unchanged
    const v1Rows = await queryPromptVersionRows(testDb, sql`id = ${v1.id}`);
    expect(v1Rows[0]?.version).toBe("v1");

    // v2 row exists
    const v2Rows = await queryPromptVersionRows(testDb, sql`id = ${v2.id}`);
    expect(v2Rows[0]?.version).toBe("v2");
  });

  it("rejects a duplicate version label for the same prompt", async () => {
    const fixture = await makePromptFixtureOrg(testDb);
    await createPromptInOrg(testDb, fixture, "dupe-version-prompt");

    await withTenantContext(testDb.appDb, fixture.organizationId, (tx) =>
      publishVersion(tx, fixture.actor, {
        organizationId: fixture.organizationId,
        promptName: "dupe-version-prompt",
        version: "v1",
      }),
    );

    await expect(
      withTenantContext(testDb.appDb, fixture.organizationId, (tx) =>
        publishVersion(tx, fixture.actor, {
          organizationId: fixture.organizationId,
          promptName: "dupe-version-prompt",
          version: "v1",
        }),
      ),
    ).rejects.toBeInstanceOf(DuplicatePromptVersionError);
  });

  it("rejects publishing to a prompt that does not exist in the caller's organization", async () => {
    const fixture = await makePromptFixtureOrg(testDb);
    const otherFixture = await makePromptFixtureOrg(testDb);

    // Create prompt in the other org
    await createPromptInOrg(testDb, otherFixture, "cross-org-prompt");

    // Try to publish from a different org — should see the prompt as nonexistent
    await expect(
      withTenantContext(testDb.appDb, fixture.organizationId, (tx) =>
        publishVersion(tx, fixture.actor, {
          organizationId: fixture.organizationId,
          promptName: "cross-org-prompt",
          version: "v1",
        }),
      ),
    ).rejects.toBeInstanceOf(PromptNotFoundError);
  });
});
