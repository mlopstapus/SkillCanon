import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createObjective } from "@/bcs/governance";
import { setEvalsEnabled, type EvalProviderPool } from "@/bcs/prompt-registry";
import { seedOrgWithAdmin } from "@/shared/api/test-helpers";
import { withTenantContext } from "@/shared/db";
import { startTestDb, type TestDb } from "@/shared/db/test-helpers";
import { AiNotEnabledError } from "./governance-interview";
import { OrgSummaryNotAllowedError, clearObjectiveSummaryCache, summarizeObjectives } from "./summarize-objectives";

describe("summarizeObjectives", () => {
  let testDb: TestDb;

  beforeAll(async () => {
    testDb = await startTestDb();
  }, 120_000);

  afterAll(async () => {
    await testDb.teardown();
  });

  beforeEach(() => {
    vi.stubEnv("STRIPE_ENABLED", "true");
    clearObjectiveSummaryCache();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  function stubPool(calls: string[]): EvalProviderPool {
    return {
      providers: [
        {
          id: "stub",
          complete: async ({ user }) => {
            calls.push(user);
            return { text: "  Summary text.  ", tokens: 5 };
          },
        },
      ],
      models: ["stub/m1"],
    };
  }

  async function seed(optIn = true) {
    const seeded = await seedOrgWithAdmin(testDb.authDb);
    const actor = { organizationId: seeded.organizationId, userId: seeded.adminUserId, role: "admin" as const };
    const verifier = { teamBelongsToOrganization: async () => true };
    const addObjective = (title: string) =>
      withTenantContext(testDb.appDb, seeded.organizationId, (tx) =>
        createObjective(tx, actor, { teamId: seeded.teamId, title, description: "Why." }, verifier),
      );
    if (optIn) {
      await withTenantContext(testDb.appDb, seeded.organizationId, (tx) =>
        setEvalsEnabled(
          tx,
          { id: seeded.adminUserId, orgId: seeded.organizationId, teamId: seeded.teamId, role: "admin", email: seeded.adminEmail },
          true,
        ),
      );
    }
    return { seeded, actor, addObjective };
  }

  it("summarizes a team's objectives, serves a repeat from cache, and re-calls the model when they change", async () => {
    const { seeded, actor, addObjective } = await seed();
    const calls: string[] = [];
    await addObjective("Cut cloud cost");
    const run = () =>
      withTenantContext(testDb.appDb, seeded.organizationId, (tx) =>
        summarizeObjectives(tx, actor, { kind: "team", teamId: seeded.teamId }, stubPool(calls)),
      );

    const first = await run();
    expect(first).toEqual({ summary: "Summary text.", objectiveCount: 1, cached: false });
    expect(calls[0]).toContain("Cut cloud cost");

    expect((await run()).cached).toBe(true);
    expect(calls).toHaveLength(1);

    await addObjective("Ship faster");
    const third = await run();
    expect(third.cached).toBe(false);
    expect(third.objectiveCount).toBe(2);
    expect(calls).toHaveLength(2);
  });

  it("rolls up the whole org for an admin and refuses it for a non-admin", async () => {
    const { seeded, actor, addObjective } = await seed();
    const calls: string[] = [];
    await addObjective("Cut cloud cost");

    const result = await withTenantContext(testDb.appDb, seeded.organizationId, (tx) =>
      summarizeObjectives(tx, actor, { kind: "org" }, stubPool(calls)),
    );
    expect(result.objectiveCount).toBe(1);
    expect(calls[0]).toContain("Cut cloud cost");

    await expect(
      withTenantContext(testDb.appDb, seeded.organizationId, (tx) =>
        summarizeObjectives(tx, { ...actor, role: "member" }, { kind: "org" }, stubPool(calls)),
      ),
    ).rejects.toThrow(OrgSummaryNotAllowedError);
  });

  it("refuses without the org opt-in and says so plainly when there is nothing to summarize", async () => {
    const off = await seed(false);
    await expect(
      withTenantContext(testDb.appDb, off.seeded.organizationId, (tx) =>
        summarizeObjectives(tx, off.actor, { kind: "team", teamId: off.seeded.teamId }, stubPool([])),
      ),
    ).rejects.toThrow(AiNotEnabledError);

    const empty = await seed();
    const calls: string[] = [];
    const result = await withTenantContext(testDb.appDb, empty.seeded.organizationId, (tx) =>
      summarizeObjectives(tx, empty.actor, { kind: "team", teamId: empty.seeded.teamId }, stubPool(calls)),
    );
    expect(result.objectiveCount).toBe(0);
    expect(calls).toHaveLength(0);
  });
});
