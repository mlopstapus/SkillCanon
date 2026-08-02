import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { withTenantContext } from "@/shared/db/tenant-context";
import { startTestDb, type TestDb } from "@/shared/db/test-helpers";
import { PromptNotFoundError } from "../domain/prompt";
import { assertSkillAccessible } from "./authorize-chain-run-action";
import { findPromptByOrgAndName } from "../infrastructure/prompts-repo";
import { makeChainFixtureOrg, publishThreeStepChain, type ChainFixtureOrg } from "./skill-chain-test-helpers";

describe("assertSkillAccessible", () => {
  let testDb: TestDb;

  beforeAll(async () => {
    testDb = await startTestDb();
  }, 120_000);

  afterAll(async () => {
    await testDb.teardown();
  });

  async function getPrompt(fixture: ChainFixtureOrg, name: string) {
    const row = await withTenantContext(testDb.appDb, fixture.organizationId, (tx) =>
      findPromptByOrgAndName(tx, fixture.organizationId, name),
    );
    if (!row) throw new Error("expected a prompt row");
    return row;
  }

  it("resolves without error for the skill's own owner", async () => {
    const fixture = await makeChainFixtureOrg(testDb);
    await publishThreeStepChain(testDb, fixture, "owner-accessible-chain");
    const prompt = await getPrompt(fixture, "owner-accessible-chain");

    await expect(
      withTenantContext(testDb.appDb, fixture.organizationId, (tx) =>
        assertSkillAccessible(tx, fixture.actor, prompt),
      ),
    ).resolves.toBeUndefined();
  });

  it("rejects a same-org user with no ownership, subscription, or project membership, as PromptNotFoundError", async () => {
    const fixture = await makeChainFixtureOrg(testDb);
    // Owned by `ownerType: "user"`/actorUserId (createPrompt's default) —
    // otherUserId shares the same team but has no personal ownership grant.
    await publishThreeStepChain(testDb, fixture, "no-access-chain");
    const prompt = await getPrompt(fixture, "no-access-chain");

    const strangerActor = { organizationId: fixture.organizationId, userId: fixture.otherUserId };
    await expect(
      withTenantContext(testDb.appDb, fixture.organizationId, (tx) =>
        assertSkillAccessible(tx, strangerActor, prompt),
      ),
    ).rejects.toBeInstanceOf(PromptNotFoundError);
  });
});
