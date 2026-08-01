import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { getPromptUsageSummaryForProject } from "@/bcs/distribution";
import { withTenantContext } from "@/shared/db/tenant-context";
import { startTestDb, type TestDb } from "@/shared/db/test-helpers";
import { ExpansionSourceNotFoundError } from "../domain/expansion";
import { expand } from "./expand";
import {
  createUnpublishedSkill,
  makeExpansionFixtureOrg,
  publishAnotherVersion,
  publishDeprecatedSkill,
  publishSkill,
  type ExpansionFixtureOrg,
} from "./expansion-test-helpers";

describe("expand (US1 — plain, ungoverned rendering)", () => {
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

  it("renders both system and user messages with input substituted correctly (AC1)", async () => {
    const fixture = await makeExpansionFixtureOrg(testDb);
    await publishSkill(testDb, fixture, {
      name: "basic-greet",
      systemTemplate: "You are a {{ tone }} assistant.",
      userTemplate: "Say hello to {{ input }}.",
    });

    const result = await runExpand(fixture, {
      promptName: "basic-greet",
      input: { tone: "friendly", input: "world" },
    });

    expect(result.systemMessage).toBe("You are a friendly assistant.");
    expect(result.userMessage).toBe("Say hello to world.");
    expect(result.appliedPolicies).toEqual([]);
    expect(result.objectives).toEqual([]);
  });

  it("returns systemMessage: null when the active version has no system template (AC2)", async () => {
    const fixture = await makeExpansionFixtureOrg(testDb);
    await publishSkill(testDb, fixture, {
      name: "system-less",
      systemTemplate: null,
      userTemplate: "Only user content: {{ input }}",
    });

    const result = await runExpand(fixture, { promptName: "system-less", input: { input: "x" } });

    expect(result.systemMessage).toBeNull();
    expect(result.userMessage).toBe("Only user content: x");
  });

  it("rejects a skill with no published version yet, same as a nonexistent skill (AC3)", async () => {
    const fixture = await makeExpansionFixtureOrg(testDb);
    await createUnpublishedSkill(testDb, fixture, "never-published");

    await expect(runExpand(fixture, { promptName: "never-published", input: {} })).rejects.toThrow(
      ExpansionSourceNotFoundError,
    );
  });

  it("rejects a nonexistent skill", async () => {
    const fixture = await makeExpansionFixtureOrg(testDb);

    await expect(runExpand(fixture, { promptName: "does-not-exist", input: {} })).rejects.toThrow(
      ExpansionSourceNotFoundError,
    );
  });

  it("rejects a deprecated skill even when its default version is requested (AC4)", async () => {
    const fixture = await makeExpansionFixtureOrg(testDb);
    await publishDeprecatedSkill(testDb, fixture, {
      name: "deprecated-default",
      userTemplate: "should not render",
    });

    await expect(runExpand(fixture, { promptName: "deprecated-default", input: {} })).rejects.toThrow(
      ExpansionSourceNotFoundError,
    );
  });

  it("rejects a deprecated skill even when a specific still-existing version is explicitly requested (AC4)", async () => {
    const fixture = await makeExpansionFixtureOrg(testDb);
    await publishDeprecatedSkill(testDb, fixture, {
      name: "deprecated-explicit",
      userTemplate: "should not render",
      version: "1.0.0",
    });

    await expect(
      runExpand(fixture, { promptName: "deprecated-explicit", input: {}, version: "1.0.0" }),
    ).rejects.toThrow(ExpansionSourceNotFoundError);
  });

  it("fails visibly rather than rendering blank when a template references an unsupplied variable (AC5)", async () => {
    const fixture = await makeExpansionFixtureOrg(testDb);
    await publishSkill(testDb, fixture, { name: "undefined-var", userTemplate: "Needs {{ not_supplied }}." });

    await expect(runExpand(fixture, { promptName: "undefined-var", input: {} })).rejects.toThrow();
  });

  it("never executes template content attempting arbitrary code — only registered globals are callable (AC6)", async () => {
    const fixture = await makeExpansionFixtureOrg(testDb);
    // No `process`/`require`/filesystem global is ever registered — a
    // template attempting to reach one is just another undefined reference,
    // which `throwOnUndefined: true` rejects rather than executing anything.
    await publishSkill(testDb, fixture, {
      name: "code-exec-attempt",
      userTemplate: "{{ process.env.SECRET }}",
    });

    await expect(runExpand(fixture, { promptName: "code-exec-attempt", input: {} })).rejects.toThrow();
  });

  it("does not validate caller input against the skill's declared input_schema (FR-012)", async () => {
    const fixture = await makeExpansionFixtureOrg(testDb);
    await publishSkill(testDb, fixture, { name: "unvalidated-input", userTemplate: "Got: {{ anything }}" });

    // Wildly mismatched shape vs. whatever input_schema the version declared
    // (this fixture leaves it at the default `{}`) — still succeeds.
    const result = await runExpand(fixture, {
      promptName: "unvalidated-input",
      input: { anything: "literally anything", extraUnrelatedKey: 123 },
    });

    expect(result.userMessage).toBe("Got: literally anything");
  });

  it("uses the currently-active version when multiple versions exist and none is pinned", async () => {
    const fixture = await makeExpansionFixtureOrg(testDb);
    await publishSkill(testDb, fixture, { name: "multi-version", userTemplate: "v1: {{ input }}" });
    await publishAnotherVersion(testDb, fixture, { name: "multi-version", userTemplate: "v2: {{ input }}" });

    const result = await runExpand(fixture, { promptName: "multi-version", input: { input: "x" } });

    // publishVersion advances activeVersionId to the newest publish.
    expect(result.userMessage).toBe("v2: x");
  });

  it("uses an explicitly requested version rather than the active one", async () => {
    const fixture = await makeExpansionFixtureOrg(testDb);
    await publishSkill(testDb, fixture, { name: "pinned-version", userTemplate: "v1: {{ input }}" });
    await publishAnotherVersion(testDb, fixture, { name: "pinned-version", userTemplate: "v2: {{ input }}" });

    const result = await runExpand(fixture, {
      promptName: "pinned-version",
      input: { input: "x" },
      version: "1.0.0",
    });

    expect(result.userMessage).toBe("v1: x");
  });

  it("never records a distribution.prompt_usage row — a live-preview/test call must never count as usage (spec FR-002a, 024-project-usage-metrics-dashboard)", async () => {
    const fixture = await makeExpansionFixtureOrg(testDb);
    await publishSkill(testDb, fixture, { name: "no-usage-recorded", userTemplate: "hi {{ input }}" });
    const projectId = randomUUID();

    const before = await withTenantContext(testDb.appDb, fixture.organizationId, (tx) =>
      getPromptUsageSummaryForProject(tx, fixture.organizationId, projectId, { activeWindowDays: 30, trendDays: 14 }),
    );

    await runExpand(fixture, {
      promptName: "no-usage-recorded",
      input: { input: "x" },
      userId: fixture.actor.userId,
      projectId,
    });

    const after = await withTenantContext(testDb.appDb, fixture.organizationId, (tx) =>
      getPromptUsageSummaryForProject(tx, fixture.organizationId, projectId, { activeWindowDays: 30, trendDays: 14 }),
    );

    expect(after.totalInvocations).toBe(before.totalInvocations);
    expect(after.totalInvocations).toBe(0);
  });
});
