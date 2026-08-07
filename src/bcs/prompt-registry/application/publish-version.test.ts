import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { withTenantContext } from "@/shared/db/tenant-context";
import { startTestDb, type TestDb } from "@/shared/db/test-helpers";
import {
  DuplicatePromptVersionError,
  InvalidVersionFilesError,
  InvalidVersionShapeError,
  MAX_FILE_SIZE_BYTES,
  MAX_SUPPORTING_FILES,
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

  it("publishes a version with a main file and two supporting files, all retrievable exactly as authored, and records a PromptVersionPublished audit event", async () => {
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
          mainFile: { content: "Be helpful." },
          supportingFiles: [
            { name: "checklist.md", content: "- one\n- two" },
            { name: "example.md", content: "An example transcript." },
          ],
          tags: ["production"],
        },
        { transport: "api", sourceIp: "10.0.0.1" },
      ),
    );

    expect(v.version).toBe("v1");
    expect(v.kind).toBe("template");
    expect(v.tags).toEqual(["production"]);
    expect(v.files).toHaveLength(3);
    const main = v.files.find((f) => f.isMain);
    expect(main?.name).toBe("SKILL.md");
    expect(main?.content).toBe("Be helpful.");
    const checklist = v.files.find((f) => f.name === "checklist.md");
    expect(checklist?.content).toBe("- one\n- two");
    expect(checklist?.isMain).toBe(false);
    const example = v.files.find((f) => f.name === "example.md");
    expect(example?.content).toBe("An example transcript.");

    const events = await queryPromptAuditEvents(
      testDb,
      sql`action = 'prompt_version.published' and resource_id = ${v.id}`,
    );
    expect(events).toHaveLength(1);
    expect(events[0]?.transport).toBe("api");
  });

  it("publishes a version with only a main file (zero supporting files)", async () => {
    const fixture = await makePromptFixtureOrg(testDb);
    await createPromptInOrg(testDb, fixture, "main-only-prompt");

    const v = await withTenantContext(testDb.appDb, fixture.organizationId, (tx) =>
      publishVersion(tx, fixture.actor, {
        organizationId: fixture.organizationId,
        promptName: "main-only-prompt",
        version: "v1",
        mainFile: { content: "Just the main file." },
      }),
    );

    expect(v.files).toHaveLength(1);
    expect(v.files[0]?.isMain).toBe(true);
  });

  it("rejects an empty main file", async () => {
    const fixture = await makePromptFixtureOrg(testDb);
    await createPromptInOrg(testDb, fixture, "empty-main-prompt");

    await expect(
      withTenantContext(testDb.appDb, fixture.organizationId, (tx) =>
        publishVersion(tx, fixture.actor, {
          organizationId: fixture.organizationId,
          promptName: "empty-main-prompt",
          version: "v1",
          mainFile: { content: "" },
        }),
      ),
    ).rejects.toBeInstanceOf(InvalidVersionFilesError);
  });

  it("rejects a file (main or supporting) exceeding the max size", async () => {
    const fixture = await makePromptFixtureOrg(testDb);
    await createPromptInOrg(testDb, fixture, "oversized-prompt");
    const tooLarge = "a".repeat(MAX_FILE_SIZE_BYTES + 1);

    await expect(
      withTenantContext(testDb.appDb, fixture.organizationId, (tx) =>
        publishVersion(tx, fixture.actor, {
          organizationId: fixture.organizationId,
          promptName: "oversized-prompt",
          version: "v1",
          mainFile: { content: "Fine." },
          supportingFiles: [{ name: "big.md", content: tooLarge }],
        }),
      ),
    ).rejects.toBeInstanceOf(InvalidVersionFilesError);
  });

  it("rejects two supporting files sharing a name", async () => {
    const fixture = await makePromptFixtureOrg(testDb);
    await createPromptInOrg(testDb, fixture, "dupe-file-name-prompt");

    await expect(
      withTenantContext(testDb.appDb, fixture.organizationId, (tx) =>
        publishVersion(tx, fixture.actor, {
          organizationId: fixture.organizationId,
          promptName: "dupe-file-name-prompt",
          version: "v1",
          mainFile: { content: "Fine." },
          supportingFiles: [
            { name: "dup.md", content: "one" },
            { name: "dup.md", content: "two" },
          ],
        }),
      ),
    ).rejects.toBeInstanceOf(InvalidVersionFilesError);
  });

  it("rejects more than the maximum number of supporting files", async () => {
    const fixture = await makePromptFixtureOrg(testDb);
    await createPromptInOrg(testDb, fixture, "too-many-files-prompt");
    const supportingFiles = Array.from({ length: MAX_SUPPORTING_FILES + 1 }, (_, i) => ({
      name: `file-${i}.md`,
      content: "content",
    }));

    await expect(
      withTenantContext(testDb.appDb, fixture.organizationId, (tx) =>
        publishVersion(tx, fixture.actor, {
          organizationId: fixture.organizationId,
          promptName: "too-many-files-prompt",
          version: "v1",
          mainFile: { content: "Fine." },
          supportingFiles,
        }),
      ),
    ).rejects.toBeInstanceOf(InvalidVersionFilesError);
  });

  it("advances active_version_id to the latest published version, never touching an earlier version's stored row", async () => {
    const fixture = await makePromptFixtureOrg(testDb);
    await createPromptInOrg(testDb, fixture, "advance-test");

    const v1 = await withTenantContext(testDb.appDb, fixture.organizationId, (tx) =>
      publishVersion(tx, fixture.actor, {
        organizationId: fixture.organizationId,
        promptName: "advance-test",
        version: "v1",
        mainFile: { content: "v1 content" },
      }),
    );
    const v2 = await withTenantContext(testDb.appDb, fixture.organizationId, (tx) =>
      publishVersion(tx, fixture.actor, {
        organizationId: fixture.organizationId,
        promptName: "advance-test",
        version: "v2",
        mainFile: { content: "v2 content" },
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
        mainFile: { content: "content" },
      }),
    );

    await expect(
      withTenantContext(testDb.appDb, fixture.organizationId, (tx) =>
        publishVersion(tx, fixture.actor, {
          organizationId: fixture.organizationId,
          promptName: "dupe-version-prompt",
          version: "v1",
          mainFile: { content: "content" },
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

  it("publishes a chain version storing its steps verbatim, with no existence/cycle validation at publish time", async () => {
    const fixture = await makePromptFixtureOrg(testDb);
    await createPromptInOrg(testDb, fixture, "chain-prompt");

    const steps = [
      { id: "step1", promptName: "nonexistent-skill", dependsOn: [] },
      { id: "step2", promptName: "also-nonexistent", dependsOn: ["step1", "step3-does-not-exist"] },
    ];

    const v = await withTenantContext(testDb.appDb, fixture.organizationId, (tx) =>
      publishVersion(tx, fixture.actor, {
        organizationId: fixture.organizationId,
        promptName: "chain-prompt",
        version: "v1",
        steps,
      }),
    );

    expect(v.kind).toBe("chain");
    expect(v.steps).toEqual(steps);
    expect(v.systemTemplate).toBeNull();
    expect(v.userTemplate).toBeNull();
    expect(v.files).toHaveLength(0);
  });

  it("rejects a version specifying both chain steps and a main file", async () => {
    const fixture = await makePromptFixtureOrg(testDb);
    await createPromptInOrg(testDb, fixture, "mixed-shape-prompt");

    await expect(
      withTenantContext(testDb.appDb, fixture.organizationId, (tx) =>
        publishVersion(tx, fixture.actor, {
          organizationId: fixture.organizationId,
          promptName: "mixed-shape-prompt",
          version: "v1",
          mainFile: { content: "content" },
          steps: [{ id: "step1", promptName: "x", dependsOn: [] }],
        }),
      ),
    ).rejects.toBeInstanceOf(InvalidVersionShapeError);
  });

  it("rejects a version specifying neither chain steps nor a main file", async () => {
    const fixture = await makePromptFixtureOrg(testDb);
    await createPromptInOrg(testDb, fixture, "empty-shape-prompt");

    await expect(
      withTenantContext(testDb.appDb, fixture.organizationId, (tx) =>
        publishVersion(tx, fixture.actor, {
          organizationId: fixture.organizationId,
          promptName: "empty-shape-prompt",
          version: "v1",
        }),
      ),
    ).rejects.toBeInstanceOf(InvalidVersionShapeError);
  });

  it("never writes a prompt_version_files row when publishing a chain-kind version", async () => {
    const fixture = await makePromptFixtureOrg(testDb);
    await createPromptInOrg(testDb, fixture, "chain-no-files-prompt");

    const v = await withTenantContext(testDb.appDb, fixture.organizationId, (tx) =>
      publishVersion(tx, fixture.actor, {
        organizationId: fixture.organizationId,
        promptName: "chain-no-files-prompt",
        version: "v1",
        steps: [{ id: "step1", promptName: "x", dependsOn: [] }],
      }),
    );

    expect(v.files).toHaveLength(0);
  });
});
