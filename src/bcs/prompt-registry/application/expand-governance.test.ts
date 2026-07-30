import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { withTenantContext } from "@/shared/db/tenant-context";
import { startTestDb, type TestDb } from "@/shared/db/test-helpers";
import { expand } from "./expand";
import {
  createExpansionFixtureTeam,
  createExpansionFixtureUser,
  grantObjective,
  grantPolicy,
  makeExpansionFixtureOrg,
  publishSkill,
  type ExpansionFixtureOrg,
} from "./expansion-test-helpers";

describe("expand (US2 — caller's governance is automatically applied)", () => {
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

  it("prepends prepend-type policy content before the system template's own content (AC1)", async () => {
    const fixture = await makeExpansionFixtureOrg(testDb);
    await publishSkill(testDb, fixture, {
      name: "governed-prepend",
      systemTemplate: "Base system.",
      userTemplate: "Task: {{ input }}.",
    });
    await grantPolicy(testDb, fixture, fixture.teamId, {
      name: "safety-rules",
      enforcementType: "prepend",
      content: "Follow safety rules.",
    });

    const result = await runExpand(fixture, {
      promptName: "governed-prepend",
      input: { input: "draft the report" },
      userId: fixture.actorUserId,
    });

    expect(result.systemMessage).toBe("Follow safety rules.\n\nBase system.");
    expect(result.appliedPolicies).toEqual(["safety-rules"]);
  });

  it("appends append-type policy content after the user template's own content (AC2)", async () => {
    const fixture = await makeExpansionFixtureOrg(testDb);
    await publishSkill(testDb, fixture, {
      name: "governed-append",
      userTemplate: "Task: {{ input }}.",
    });
    await grantPolicy(testDb, fixture, fixture.teamId, {
      name: "cite-sources",
      enforcementType: "append",
      content: "Cite your sources.",
    });

    const result = await runExpand(fixture, {
      promptName: "governed-append",
      input: { input: "draft the report" },
      userId: fixture.actorUserId,
    });

    expect(result.userMessage).toBe("Task: draft the report.\n\nCite your sources.");
    expect(result.appliedPolicies).toEqual(["cite-sources"]);
  });

  it("makes inject-type policy content available only where the template references it (AC3)", async () => {
    const fixture = await makeExpansionFixtureOrg(testDb);
    await publishSkill(testDb, fixture, {
      name: "governed-inject",
      userTemplate: "Guidance: {{ policies }}\nTask: {{ input }}.",
    });
    await grantPolicy(testDb, fixture, fixture.teamId, {
      name: "formal-tone",
      enforcementType: "inject",
      content: "Use a formal tone.",
    });

    const result = await runExpand(fixture, {
      promptName: "governed-inject",
      input: { input: "draft the report" },
      userId: fixture.actorUserId,
    });

    expect(result.userMessage).toBe("Guidance: Use a formal tone.\nTask: draft the report.");
    expect(result.appliedPolicies).toEqual(["formal-tone"]);
  });

  it("reports exactly the policies actually applied when more than one applies (AC4)", async () => {
    const fixture = await makeExpansionFixtureOrg(testDb);
    await publishSkill(testDb, fixture, {
      name: "governed-two-policies",
      systemTemplate: "Base system.",
      userTemplate: "Task: {{ input }}.",
    });
    await grantPolicy(testDb, fixture, fixture.teamId, {
      name: "policy-a",
      enforcementType: "prepend",
      content: "A content.",
    });
    await grantPolicy(testDb, fixture, fixture.teamId, {
      name: "policy-b",
      enforcementType: "append",
      content: "B content.",
    });

    const result = await runExpand(fixture, {
      promptName: "governed-two-policies",
      input: { input: "x" },
      userId: fixture.actorUserId,
    });

    expect(result.appliedPolicies.sort()).toEqual(["policy-a", "policy-b"]);
  });

  it("produces output identical to an ungoverned expansion for a user with zero effective policies (AC5)", async () => {
    const fixture = await makeExpansionFixtureOrg(testDb);
    await publishSkill(testDb, fixture, { name: "zero-policy-skill", userTemplate: "Plain: {{ input }}." });

    const ungoverned = await runExpand(fixture, { promptName: "zero-policy-skill", input: { input: "x" } });
    const governedButEmpty = await runExpand(fixture, {
      promptName: "zero-policy-skill",
      input: { input: "x" },
      userId: fixture.actorUserId,
    });

    expect(governedButEmpty.systemMessage).toBe(ungoverned.systemMessage);
    expect(governedButEmpty.userMessage).toBe(ungoverned.userMessage);
    expect(governedButEmpty.appliedPolicies).toEqual([]);
    expect(ungoverned.appliedPolicies).toEqual([]);
  });

  it("resolves policies from the invoking user's own team chain, never the skill's owning team (AC6)", async () => {
    const fixture = await makeExpansionFixtureOrg(testDb);
    // The skill is published under the fixture's default actor/team.
    await publishSkill(testDb, fixture, {
      name: "cross-team-skill",
      systemTemplate: "Base system.",
      userTemplate: "Task: {{ input }}.",
    });
    // The skill-owning team has its own policy — must NEVER apply.
    await grantPolicy(testDb, fixture, fixture.teamId, {
      name: "owner-team-policy",
      enforcementType: "prepend",
      content: "Owner team content.",
    });

    // A completely different team + user — the actual invoker.
    const invokerTeamId = await createExpansionFixtureTeam(testDb, fixture, { name: "Invoker Team" });
    const invokerUserId = await createExpansionFixtureUser(testDb, fixture, invokerTeamId);
    await grantPolicy(testDb, fixture, invokerTeamId, {
      name: "invoker-team-policy",
      enforcementType: "prepend",
      content: "Invoker team content.",
    });

    const result = await runExpand(fixture, {
      promptName: "cross-team-skill",
      input: { input: "x" },
      userId: invokerUserId,
    });

    expect(result.appliedPolicies).toEqual(["invoker-team-policy"]);
    expect(result.systemMessage).toBe("Invoker team content.\n\nBase system.");
  });

  it("resolves as fully ungoverned when no acting user is given, regardless of the skill's owner (FR-013/AC7)", async () => {
    const fixture = await makeExpansionFixtureOrg(testDb);
    await publishSkill(testDb, fixture, { name: "no-actor-skill", userTemplate: "Plain: {{ input }}." });
    await grantPolicy(testDb, fixture, fixture.teamId, {
      name: "should-never-apply",
      enforcementType: "prepend",
      content: "Should never apply.",
    });

    const result = await runExpand(fixture, { promptName: "no-actor-skill", input: { input: "x" } });

    expect(result.appliedPolicies).toEqual([]);
    expect(result.objectives).toEqual([]);
    expect(result.userMessage).toBe("Plain: x.");
  });

  it("includes project-scoped objectives when projectId is given, without affecting which policies apply (AC8/FR-015)", async () => {
    const fixture = await makeExpansionFixtureOrg(testDb);
    await publishSkill(testDb, fixture, {
      name: "project-scoped-skill",
      systemTemplate: "Base system.",
      userTemplate: "Goals: {{ objectives }}\nTask: {{ input }}.",
    });
    await grantPolicy(testDb, fixture, fixture.teamId, {
      name: "team-policy",
      enforcementType: "prepend",
      content: "Team policy content.",
    });
    await grantObjective(testDb, fixture, { teamId: fixture.teamId }, "Team-wide objective");

    const projectId = crypto.randomUUID();
    await grantObjective(testDb, fixture, { projectId }, "Project-scoped objective");

    const withoutProject = await runExpand(fixture, {
      promptName: "project-scoped-skill",
      input: { input: "x" },
      userId: fixture.actorUserId,
    });
    const withProject = await runExpand(fixture, {
      promptName: "project-scoped-skill",
      input: { input: "x" },
      userId: fixture.actorUserId,
      projectId,
    });

    expect(withoutProject.objectives).toEqual(["Team-wide objective"]);
    expect(withProject.objectives.sort()).toEqual(["Project-scoped objective", "Team-wide objective"].sort());
    // Policies applied are completely unaffected by projectId.
    expect(withoutProject.appliedPolicies).toEqual(["team-policy"]);
    expect(withProject.appliedPolicies).toEqual(["team-policy"]);
    expect(withoutProject.systemMessage).toBe(withProject.systemMessage);
  });
});
