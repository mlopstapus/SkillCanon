import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { withTenantContext } from "@/shared/db/tenant-context";
import { startTestDb, type TestDb } from "@/shared/db/test-helpers";
import { PromptNotFoundError } from "../domain/prompt";
import { publishVersion } from "./publish-version";
import { listVersions } from "./list-versions";
import { createPromptInOrg, makePromptFixtureOrg } from "./prompt-test-helpers";

describe("listVersions", () => {
  let testDb: TestDb;

  beforeAll(async () => {
    testDb = await startTestDb();
  }, 120_000);

  afterAll(async () => {
    await testDb.teardown();
  });

  it("returns all published versions for a prompt in order", async () => {
    const fixture = await makePromptFixtureOrg(testDb);
    await createPromptInOrg(testDb, fixture, "multi-version");

    await withTenantContext(testDb.appDb, fixture.organizationId, (tx) =>
      publishVersion(tx, fixture.actor, {
        organizationId: fixture.organizationId,
        promptName: "multi-version",
        version: "v1",
      }),
    );
    await withTenantContext(testDb.appDb, fixture.organizationId, (tx) =>
      publishVersion(tx, fixture.actor, {
        organizationId: fixture.organizationId,
        promptName: "multi-version",
        version: "v2",
      }),
    );

    const versions = await withTenantContext(testDb.appDb, fixture.organizationId, (tx) =>
      listVersions(tx, fixture.actor, "multi-version"),
    );

    expect(versions.map((v) => v.version)).toEqual(["v1", "v2"]);
  });

  it("does not return versions from prompts in other organizations", async () => {
    const fixtureA = await makePromptFixtureOrg(testDb);
    const fixtureB = await makePromptFixtureOrg(testDb);

    await createPromptInOrg(testDb, fixtureB, "cross-org-v");
    await withTenantContext(testDb.appDb, fixtureB.organizationId, (tx) =>
      publishVersion(tx, fixtureB.actor, {
        organizationId: fixtureB.organizationId,
        promptName: "cross-org-v",
        version: "v1",
      }),
    );

    // Org A has no prompt named "cross-org-v" — should throw PromptNotFoundError
    await expect(
      withTenantContext(testDb.appDb, fixtureA.organizationId, (tx) =>
        listVersions(tx, fixtureA.actor, "cross-org-v"),
      ),
    ).rejects.toBeInstanceOf(PromptNotFoundError);
  });
});
