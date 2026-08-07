import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { withTenantContext } from "@/shared/db/tenant-context";
import { startTestDb, type TestDb } from "@/shared/db/test-helpers";
import {
  PromptNotFoundError,
  PromptVersionNotFoundError,
} from "../domain/prompt";
import { publishVersion } from "./publish-version";
import { rollbackPrompt } from "./rollback-prompt";
import {
  createPromptInOrg,
  makePromptFixtureOrg,
  queryPromptAuditEvents,
  queryPromptVersionRows,
} from "./prompt-test-helpers";

describe("rollbackPrompt", () => {
  let testDb: TestDb;

  beforeAll(async () => {
    testDb = await startTestDb();
  }, 120_000);

  afterAll(async () => {
    await testDb.teardown();
  });

  async function publishN(
    testDb: TestDb,
    fixture: Awaited<ReturnType<typeof makePromptFixtureOrg>>,
    promptName: string,
    versions: string[],
  ) {
    const published: Awaited<ReturnType<typeof publishVersion>>[] = [];
    for (const v of versions) {
      published.push(
        await withTenantContext(testDb.appDb, fixture.organizationId, (tx) =>
          publishVersion(tx, fixture.actor, {
            organizationId: fixture.organizationId,
            promptName,
            version: v,
            mainFile: { content: "content" },
          }),
        ),
      );
    }
    return published;
  }

  it("rolls back to an older version by changing only active_version_id", async () => {
    const fixture = await makePromptFixtureOrg(testDb);
    await createPromptInOrg(testDb, fixture, "rollback-test");
    const [v1, v2, v3] = await publishN(testDb, fixture, "rollback-test", ["v1", "v2", "v3"]);

    const result = await withTenantContext(testDb.appDb, fixture.organizationId, (tx) =>
      rollbackPrompt(tx, fixture.actor, "rollback-test", "v1"),
    );

    // active_version_id is now v1
    expect(result.activeVersionId).toBe(v1!.id);

    // All three version rows still exist and are unchanged
    for (const v of [v1!, v2!, v3!]) {
      const rows = await queryPromptVersionRows(testDb, sql`id = ${v.id}`);
      expect(rows).toHaveLength(1);
    }
  });

  it("records a prompt.version_activated audit event (previously missing)", async () => {
    const fixture = await makePromptFixtureOrg(testDb);
    const prompt = await createPromptInOrg(testDb, fixture, "audited-rollback");
    await publishN(testDb, fixture, "audited-rollback", ["v1", "v2"]);

    await withTenantContext(testDb.appDb, fixture.organizationId, (tx) =>
      rollbackPrompt(tx, fixture.actor, "audited-rollback", "v1", {
        transport: "api",
        sourceIp: "198.51.100.11",
      }),
    );

    const events = await queryPromptAuditEvents(
      testDb,
      sql`action = 'prompt.version_activated' and resource_id = ${prompt.id}`,
    );
    expect(events).toHaveLength(1);
    expect(events[0]?.transport).toBe("api");
    expect(events[0]?.source_ip).toBe("198.51.100.11");
  });

  it("rejects rollback to a version that was never published", async () => {
    const fixture = await makePromptFixtureOrg(testDb);
    await createPromptInOrg(testDb, fixture, "bad-version");
    await publishN(testDb, fixture, "bad-version", ["v1"]);

    await expect(
      withTenantContext(testDb.appDb, fixture.organizationId, (tx) =>
        rollbackPrompt(tx, fixture.actor, "bad-version", "v999"),
      ),
    ).rejects.toBeInstanceOf(PromptVersionNotFoundError);
  });

  it("rejects rollback from a different organization's prompt", async () => {
    const fixtureA = await makePromptFixtureOrg(testDb);
    const fixtureB = await makePromptFixtureOrg(testDb);

    await createPromptInOrg(testDb, fixtureB, "b-only-prompt");
    await publishN(testDb, fixtureB, "b-only-prompt", ["v1"]);

    // Org A cannot see org B's prompt
    await expect(
      withTenantContext(testDb.appDb, fixtureA.organizationId, (tx) =>
        rollbackPrompt(tx, fixtureA.actor, "b-only-prompt", "v1"),
      ),
    ).rejects.toBeInstanceOf(PromptNotFoundError);
  });

  it("keeps all version rows intact after rollback", async () => {
    const fixture = await makePromptFixtureOrg(testDb);
    await createPromptInOrg(testDb, fixture, "immutable-after-rollback");
    const [v1, v2] = await publishN(testDb, fixture, "immutable-after-rollback", ["v1", "v2"]);

    await withTenantContext(testDb.appDb, fixture.organizationId, (tx) =>
      rollbackPrompt(tx, fixture.actor, "immutable-after-rollback", "v1"),
    );

    // Both versions still present
    const v1Row = await queryPromptVersionRows(testDb, sql`id = ${v1!.id}`);
    const v2Row = await queryPromptVersionRows(testDb, sql`id = ${v2!.id}`);
    expect(v1Row).toHaveLength(1);
    expect(v2Row).toHaveLength(1);
    expect(v1Row[0]?.version).toBe("v1");
    expect(v2Row[0]?.version).toBe("v2");
  });
});
