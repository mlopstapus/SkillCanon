import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { setEvalsEnabled, type EvalProviderPool } from "@/bcs/prompt-registry";
import { seedOrgWithAdmin } from "@/shared/api/test-helpers";
import { withTenantContext } from "@/shared/db";
import { startTestDb, type TestDb } from "@/shared/db/test-helpers";
import {
  AiNotEnabledError,
  AiPoolNotConfiguredError,
  parseInterviewReply,
  runGovernanceInterview,
} from "./governance-interview";

describe("runGovernanceInterview", () => {
  let testDb: TestDb;

  beforeAll(async () => {
    testDb = await startTestDb();
  }, 120_000);

  afterAll(async () => {
    await testDb.teardown();
  });

  beforeEach(() => {
    vi.stubEnv("STRIPE_ENABLED", "true");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  const messages = [{ role: "user" as const, content: "We ship regulated software." }];

  function stubPool(text: string, calls: { system: string; user: string }[] = []): EvalProviderPool {
    return {
      providers: [
        {
          id: "stub",
          complete: async ({ system, user }) => {
            calls.push({ system, user });
            return { text, tokens: 42 };
          },
        },
      ],
      models: ["stub/m1"],
    };
  }

  async function seedActor(optIn: boolean) {
    const seeded = await seedOrgWithAdmin(testDb.authDb);
    const actor = { organizationId: seeded.organizationId, userId: seeded.adminUserId };
    if (optIn) {
      await withTenantContext(testDb.appDb, seeded.organizationId, (tx) =>
        setEvalsEnabled(
          tx,
          { id: seeded.adminUserId, orgId: seeded.organizationId, teamId: seeded.teamId, role: "admin", email: seeded.adminEmail },
          true,
        ),
      );
    }
    return actor;
  }

  it("returns drafts from the model and never creates anything", async () => {
    const actor = await seedActor(true);
    const calls: { system: string; user: string }[] = [];
    const reply = JSON.stringify({
      reply: "Here you go.",
      drafts: [
        { kind: "policy", name: "audit-trail", enforcementType: "append", content: "Log every change." },
        { kind: "objective", title: "Pass the audit", description: "By Q3." },
        { kind: "policy", name: "", content: "dropped" },
      ],
    });

    const result = await withTenantContext(testDb.appDb, actor.organizationId, (tx) =>
      runGovernanceInterview(tx, actor, messages, stubPool(`Sure: ${reply}`, calls)),
    );

    expect(result.reply).toBe("Here you go.");
    expect(result.drafts).toEqual([
      { kind: "policy", name: "audit-trail", enforcementType: "append", content: "Log every change." },
      { kind: "objective", title: "Pass the audit", description: "By Q3." },
    ]);
    expect(result.tokens).toBe(42);
    expect(calls[0]?.user).toContain("regulated software");
  });

  it("refuses when the org has not opted in, without calling the model", async () => {
    const actor = await seedActor(false);
    const calls: { system: string; user: string }[] = [];

    await expect(
      withTenantContext(testDb.appDb, actor.organizationId, (tx) =>
        runGovernanceInterview(tx, actor, messages, stubPool("{}", calls)),
      ),
    ).rejects.toThrow(AiNotEnabledError);
    expect(calls).toHaveLength(0);
  });

  it("refuses when no provider is configured", async () => {
    const actor = await seedActor(true);

    await expect(
      withTenantContext(testDb.appDb, actor.organizationId, (tx) =>
        runGovernanceInterview(tx, actor, messages, { providers: [], models: [] }),
      ),
    ).rejects.toThrow(AiPoolNotConfiguredError);
  });
});

describe("parseInterviewReply", () => {
  it("keeps plain text as the reply when there is no JSON, and defaults a bad enforcement type", () => {
    expect(parseInterviewReply("What is your compliance scope?")).toEqual({
      reply: "What is your compliance scope?",
      drafts: [],
    });
    expect(
      parseInterviewReply('{"reply":"ok","drafts":[{"kind":"policy","name":"a","enforcementType":"weird","content":"b"}]}').drafts,
    ).toEqual([{ kind: "policy", name: "a", enforcementType: "append", content: "b" }]);
  });
});
