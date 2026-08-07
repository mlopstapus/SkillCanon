import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { withTenantContext } from "@/shared/db/tenant-context";
import { startTestDb, type TestDb } from "@/shared/db/test-helpers";
import type { ChainStep } from "../domain/skill-chain";
import { assignSkillToProject } from "./assign-skill-to-project";
import { createPrompt } from "./create-prompt";
import { createProject } from "./create-project";
import { forkSkill } from "./fork-skill";
import { getPromptById } from "./get-prompt-by-id";
import { makeIdentityVerifier } from "./project-test-helpers";
import { publishVersion } from "./publish-version";
import { startSkillChainRun } from "./start-skill-chain-run";
import {
  createTestSkillOwnedByTeam,
  makeSubscriptionFixtureOrg,
  type SubscriptionFixtureOrg,
} from "./subscription-test-helpers";
import { subscribeSkill } from "./subscribe-skill";

const CHAIN_STEPS: ChainStep[] = [{ id: "step1", promptName: "shared-chain-target", dependsOn: [] }];

async function publishChainStepTarget(testDb: TestDb, fixture: SubscriptionFixtureOrg) {
  return withTenantContext(testDb.appDb, fixture.organizationId, async (tx) => {
    await createPrompt(tx, { organizationId: fixture.organizationId, userId: fixture.orgAdmin.id }, {
      organizationId: fixture.organizationId,
      name: "shared-chain-target",
    });
    return publishVersion(tx, { organizationId: fixture.organizationId, userId: fixture.orgAdmin.id }, {
      organizationId: fixture.organizationId,
      promptName: "shared-chain-target",
      version: "1.0.0",
      mainFile: { content: "target output" },
    });
  });
}

describe("skill chains inherit sharing with zero new code (026-skill-chains, US3)", () => {
  let testDb: TestDb;

  beforeAll(async () => {
    testDb = await startTestDb();
  }, 120_000);

  afterAll(async () => {
    await testDb.teardown();
  });

  it("a chain shared to another team via the existing, unmodified subscribeSkill becomes runnable by that team (SC-003)", async () => {
    const fixture = await makeSubscriptionFixtureOrg(testDb);
    await publishChainStepTarget(testDb, fixture);

    const chainPrompt = await createTestSkillOwnedByTeam(
      testDb,
      fixture.organizationId,
      fixture.team2Id,
      "sharing-chain",
    );
    await withTenantContext(testDb.appDb, fixture.organizationId, (tx) =>
      publishVersion(tx, { organizationId: fixture.organizationId, userId: fixture.team2Owner.id }, {
        organizationId: fixture.organizationId,
        promptName: "sharing-chain",
        version: "1.0.0",
        steps: CHAIN_STEPS,
      }),
    );

    // Before sharing: team1 has no access.
    await expect(
      withTenantContext(testDb.appDb, fixture.organizationId, (tx) =>
        startSkillChainRun(tx, { organizationId: fixture.organizationId, userId: fixture.team1Owner.id }, "sharing-chain"),
      ),
    ).rejects.toThrow();

    // Share via the platform's existing, unmodified subscribeSkill.
    await withTenantContext(testDb.appDb, fixture.organizationId, (tx) =>
      subscribeSkill(tx, fixture.orgAdmin, chainPrompt.id, {
        subscriberType: "team",
        subscriberId: fixture.team1Id,
      }),
    );

    // Now a Team 1 member can start and complete a run — zero new code.
    const result = await withTenantContext(testDb.appDb, fixture.organizationId, (tx) =>
      startSkillChainRun(tx, { organizationId: fixture.organizationId, userId: fixture.team1Owner.id }, "sharing-chain"),
    );
    expect("step" in result).toBe(true);
  });

  it("forking a chain creates an independent copy — publishing a new version on the fork doesn't affect the original", async () => {
    const fixture = await makeSubscriptionFixtureOrg(testDb);
    await publishChainStepTarget(testDb, fixture);

    const source = await createTestSkillOwnedByTeam(
      testDb,
      fixture.organizationId,
      fixture.team2Id,
      "fork-chain-source",
    );
    const sourceVersion = await withTenantContext(testDb.appDb, fixture.organizationId, (tx) =>
      publishVersion(tx, { organizationId: fixture.organizationId, userId: fixture.team2Owner.id }, {
        organizationId: fixture.organizationId,
        promptName: "fork-chain-source",
        version: "1.0.0",
        steps: CHAIN_STEPS,
      }),
    );
    expect(sourceVersion.kind).toBe("chain");

    const fork = await withTenantContext(testDb.appDb, fixture.organizationId, (tx) =>
      forkSkill(tx, fixture.userA, source.id, { ownerType: "user", ownerId: fixture.userA.id }),
    );

    // The fork itself is runnable, carrying over the chain's steps (kind/steps propagation).
    const forkRun = await withTenantContext(testDb.appDb, fixture.organizationId, (tx) =>
      startSkillChainRun(tx, { organizationId: fixture.organizationId, userId: fixture.userA.id }, fork.name),
    );
    expect("step" in forkRun).toBe(true);

    // Publish a different (non-chain) version on the fork — the source is unaffected.
    await withTenantContext(testDb.appDb, fixture.organizationId, (tx) =>
      publishVersion(tx, { organizationId: fixture.organizationId, userId: fixture.userA.id }, {
        organizationId: fixture.organizationId,
        promptName: fork.name,
        version: "2.0.0",
        mainFile: { content: "no longer a chain on the fork" },
      }),
    );

    const sourceAfter = await withTenantContext(testDb.appDb, fixture.organizationId, (tx) =>
      getPromptById(tx, fixture.organizationId, source.id),
    );
    expect(sourceAfter?.activeVersionId).toBe(sourceVersion.id);
  });

  it("assignSkillToProject succeeds on a chain version identically to a template version, with zero branching on kind", async () => {
    const fixture = await makeSubscriptionFixtureOrg(testDb);
    await publishChainStepTarget(testDb, fixture);

    const chainSkill = await createTestSkillOwnedByTeam(
      testDb,
      fixture.organizationId,
      fixture.team2Id,
      "project-assign-chain",
    );
    await withTenantContext(testDb.appDb, fixture.organizationId, (tx) =>
      publishVersion(tx, { organizationId: fixture.organizationId, userId: fixture.team2Owner.id }, {
        organizationId: fixture.organizationId,
        promptName: "project-assign-chain",
        version: "1.0.0",
        steps: CHAIN_STEPS,
      }),
    );

    const verifier = makeIdentityVerifier({
      organizationIds: [fixture.organizationId],
      teams: [{ id: fixture.team2Id, organizationId: fixture.organizationId }],
      users: [{ id: fixture.team2Owner.id, organizationId: fixture.organizationId }],
    });
    const project = await withTenantContext(testDb.appDb, fixture.organizationId, (tx) =>
      createProject(
        tx,
        { organizationId: fixture.organizationId, userId: fixture.team2Owner.id },
        {
          organizationId: fixture.organizationId,
          teamId: fixture.team2Id,
          name: "Chain Assignment Project",
          slug: `chain-assignment-project-${fixture.organizationId.slice(0, 8)}`,
        },
        verifier,
      ),
    );

    await withTenantContext(testDb.appDb, fixture.organizationId, (tx) =>
      assignSkillToProject(tx, fixture.team2Owner, project.id, chainSkill.id, { requirement: "required" }),
    );
    // No error thrown — a chain-kind skill is assigned exactly like a
    // template one, confirming assign-skill-to-project.ts needed zero
    // changes for this feature.
  });
});
