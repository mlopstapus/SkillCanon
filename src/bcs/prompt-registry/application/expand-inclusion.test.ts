import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { withTenantContext } from "@/shared/db/tenant-context";
import { startTestDb, type TestDb } from "@/shared/db/test-helpers";
import { expand } from "./expand";
import { makeExpansionFixtureOrg, publishSkill, type ExpansionFixtureOrg } from "./expansion-test-helpers";

describe("expand (US3 — nested skill inclusion)", () => {
  let testDb: TestDb;

  beforeAll(async () => {
    testDb = await startTestDb();
  }, 120_000);

  afterAll(async () => {
    await testDb.teardown();
  });

  async function runExpand(fixture: ExpansionFixtureOrg, params: Omit<Parameters<typeof expand>[1], "organizationId">) {
    return withTenantContext(testDb.appDb, fixture.organizationId, (tx) =>
      expand(tx, { organizationId: fixture.organizationId, ...params }),
    );
  }

  it("pulls another skill's rendered content into the output at the point of reference (AC1)", async () => {
    const fixture = await makeExpansionFixtureOrg(testDb);
    await publishSkill(testDb, fixture, {
      name: "included-skill",
      systemTemplate: "You are a {{ tone }} assistant.",
      userTemplate: "Say hello to {{ input }}.",
    });
    await publishSkill(testDb, fixture, {
      name: "includer-skill",
      userTemplate: "Intro: {{ include_prompt('included-skill') }}\nEnd.",
    });

    const result = await runExpand(fixture, {
      promptName: "includer-skill",
      input: { tone: "formal", input: "Bob" },
    });

    expect(result.userMessage).toBe(
      "Intro: You are a formal assistant.\n\nSay hello to Bob.\nEnd.",
    );
  });

  it("resolves a chain nested exactly to the depth limit — every level resolves successfully (AC2)", async () => {
    const fixture = await makeExpansionFixtureOrg(testDb);
    // chain-0 -> chain-1 -> chain-2 -> chain-3: three levels of nesting below
    // the top-level skill, exactly at MAX_INCLUDE_DEPTH (3) — the deepest
    // call (chain-3's own template, rendered at depth=3) makes no further
    // include_prompt call, so nothing here is depth-limited.
    await publishSkill(testDb, fixture, { name: "chain-3", userTemplate: "C3-content" });
    await publishSkill(testDb, fixture, {
      name: "chain-2",
      userTemplate: "C2[{{ include_prompt('chain-3') }}]",
    });
    await publishSkill(testDb, fixture, {
      name: "chain-1",
      userTemplate: "C1[{{ include_prompt('chain-2') }}]",
    });
    await publishSkill(testDb, fixture, {
      name: "chain-0",
      userTemplate: "C0[{{ include_prompt('chain-1') }}]",
    });

    const result = await runExpand(fixture, { promptName: "chain-0", input: {} });

    expect(result.userMessage).toBe("C0[C1[C2[C3-content]]]");
  });

  it("degrades one level past the depth limit to a visible placeholder, and the rest of expansion still completes (AC3)", async () => {
    const fixture = await makeExpansionFixtureOrg(testDb);
    // Same chain as above, plus one more level: chain-3 -> chain-4. The call
    // to include chain-4 happens at depth=3 (>= MAX_INCLUDE_DEPTH), so it
    // degrades to a placeholder instead of chain-4's real content.
    await publishSkill(testDb, fixture, { name: "chain-4b", userTemplate: "C4-content (should not appear)" });
    await publishSkill(testDb, fixture, {
      name: "chain-3b",
      userTemplate: "C3[{{ include_prompt('chain-4b') }}]",
    });
    await publishSkill(testDb, fixture, {
      name: "chain-2b",
      userTemplate: "C2[{{ include_prompt('chain-3b') }}]",
    });
    await publishSkill(testDb, fixture, {
      name: "chain-1b",
      userTemplate: "C1[{{ include_prompt('chain-2b') }}]",
    });
    await publishSkill(testDb, fixture, {
      name: "chain-0b",
      userTemplate: "C0[{{ include_prompt('chain-1b') }}]",
    });

    const result = await runExpand(fixture, { promptName: "chain-0b", input: {} });

    expect(result.userMessage).toBe("C0[C1[C2[C3[[include_prompt('chain-4b'): max depth (3) exceeded]]]]]");
    expect(result.userMessage).not.toContain("C4-content");
  });

  it("resolves a reference to a nonexistent skill to a visible placeholder, and the rest of expansion still completes (AC4)", async () => {
    const fixture = await makeExpansionFixtureOrg(testDb);
    await publishSkill(testDb, fixture, {
      name: "missing-ref-skill",
      userTemplate: "Before. {{ include_prompt('does-not-exist') }} After.",
    });

    const result = await runExpand(fixture, { promptName: "missing-ref-skill", input: {} });

    expect(result.userMessage).toBe("Before. [include_prompt('does-not-exist'): prompt not found] After.");
  });

  it("bounds a cyclic reference pair in bounded time rather than looping forever (AC5)", async () => {
    const fixture = await makeExpansionFixtureOrg(testDb);
    await publishSkill(testDb, fixture, {
      name: "cycle-a",
      userTemplate: "A[{{ include_prompt('cycle-b') }}]",
    });
    await publishSkill(testDb, fixture, {
      name: "cycle-b",
      userTemplate: "B[{{ include_prompt('cycle-a') }}]",
    });

    const result = await runExpand(fixture, { promptName: "cycle-a", input: {} });

    // Top-level cycle-a (depth0) -> include cycle-b (renders at depth1) ->
    // include cycle-a (renders at depth2) -> include cycle-b (renders at
    // depth3) -> its own include_prompt('cycle-a') call happens AT depth3
    // (>= MAX_INCLUDE_DEPTH), so that innermost call degrades to a placeholder.
    expect(result.userMessage).toBe(
      "A[B[A[B[[include_prompt('cycle-a'): max depth (3) exceeded]]]]]",
    );
  });

  it("resolves the same skill referenced more than once independently, with no special-cased dedup", async () => {
    const fixture = await makeExpansionFixtureOrg(testDb);
    await publishSkill(testDb, fixture, { name: "repeated-ref-target", userTemplate: "shared-content" });
    await publishSkill(testDb, fixture, {
      name: "repeated-ref-skill",
      userTemplate: "1:{{ include_prompt('repeated-ref-target') }} 2:{{ include_prompt('repeated-ref-target') }}",
    });

    const result = await runExpand(fixture, { promptName: "repeated-ref-skill", input: {} });

    expect(result.userMessage).toBe("1:shared-content 2:shared-content");
  });
});
