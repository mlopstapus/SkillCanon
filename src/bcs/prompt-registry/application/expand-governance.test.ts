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

  it("prepends prepend-type policy content before the main file's own content (AC1)", async () => {
    const fixture = await makeExpansionFixtureOrg(testDb);
    await publishSkill(testDb, fixture, {
      name: "governed-prepend",
      content: "Base content.",
    });
    await grantPolicy(testDb, fixture, fixture.teamId, {
      name: "safety-rules",
      enforcementType: "prepend",
      content: "Follow safety rules.",
    });

    const result = await runExpand(fixture, {
      promptName: "governed-prepend",
      userId: fixture.actorUserId,
    });

    expect(result.content).toBe("Follow safety rules.\n\nBase content.");
    expect(result.appliedPolicies).toEqual(["safety-rules"]);
  });

  it("appends append-type policy content after the main file's own content (AC2)", async () => {
    const fixture = await makeExpansionFixtureOrg(testDb);
    await publishSkill(testDb, fixture, {
      name: "governed-append",
      content: "Base content.",
    });
    await grantPolicy(testDb, fixture, fixture.teamId, {
      name: "cite-sources",
      enforcementType: "append",
      content: "Cite your sources.",
    });

    const result = await runExpand(fixture, {
      promptName: "governed-append",
      userId: fixture.actorUserId,
    });

    expect(result.content).toBe("Base content.\n\nCite your sources.");
    expect(result.appliedPolicies).toEqual(["cite-sources"]);
  });

  it("makes inject-type policy content available only where the main file references it (AC3)", async () => {
    const fixture = await makeExpansionFixtureOrg(testDb);
    await publishSkill(testDb, fixture, {
      name: "governed-inject",
      content: "Guidance: {{ policies }}\nTask: draft the report.",
    });
    await grantPolicy(testDb, fixture, fixture.teamId, {
      name: "formal-tone",
      enforcementType: "inject",
      content: "Use a formal tone.",
    });

    const result = await runExpand(fixture, {
      promptName: "governed-inject",
      userId: fixture.actorUserId,
    });

    expect(result.content).toBe("Guidance: Use a formal tone.\nTask: draft the report.");
    expect(result.appliedPolicies).toEqual(["formal-tone"]);
  });

  it("reports exactly the policies actually applied when more than one applies (AC4)", async () => {
    const fixture = await makeExpansionFixtureOrg(testDb);
    await publishSkill(testDb, fixture, {
      name: "governed-two-policies",
      content: "Base content.",
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
      userId: fixture.actorUserId,
    });

    expect(result.appliedPolicies.sort()).toEqual(["policy-a", "policy-b"]);
  });

  it("produces output identical to an ungoverned expansion for a user with zero effective policies (AC5)", async () => {
    const fixture = await makeExpansionFixtureOrg(testDb);
    await publishSkill(testDb, fixture, { name: "zero-policy-skill", content: "Plain content." });

    const ungoverned = await runExpand(fixture, { promptName: "zero-policy-skill" });
    const governedButEmpty = await runExpand(fixture, {
      promptName: "zero-policy-skill",
      userId: fixture.actorUserId,
    });

    expect(governedButEmpty.content).toBe(ungoverned.content);
    expect(governedButEmpty.appliedPolicies).toEqual([]);
    expect(ungoverned.appliedPolicies).toEqual([]);
  });

  it("resolves policies from the invoking user's own team chain, never the skill's owning team (AC6)", async () => {
    const fixture = await makeExpansionFixtureOrg(testDb);
    // The skill is published under the fixture's default actor/team.
    await publishSkill(testDb, fixture, {
      name: "cross-team-skill",
      content: "Base content.",
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
      userId: invokerUserId,
    });

    expect(result.appliedPolicies).toEqual(["invoker-team-policy"]);
    expect(result.content).toBe("Invoker team content.\n\nBase content.");
  });

  it("resolves as fully ungoverned when no acting user is given, regardless of the skill's owner (FR-013/AC7)", async () => {
    const fixture = await makeExpansionFixtureOrg(testDb);
    await publishSkill(testDb, fixture, { name: "no-actor-skill", content: "Plain content." });
    await grantPolicy(testDb, fixture, fixture.teamId, {
      name: "should-never-apply",
      enforcementType: "prepend",
      content: "Should never apply.",
    });

    const result = await runExpand(fixture, { promptName: "no-actor-skill" });

    expect(result.appliedPolicies).toEqual([]);
    expect(result.objectives).toEqual([]);
    expect(result.content).toBe("Plain content.");
  });

  it("includes project-scoped objectives when projectId is given, without affecting which policies apply (AC8/FR-015)", async () => {
    const fixture = await makeExpansionFixtureOrg(testDb);
    await publishSkill(testDb, fixture, {
      name: "project-scoped-skill",
      content: "Goals: {{ objectives }}\nTask: draft the report.",
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
      userId: fixture.actorUserId,
    });
    const withProject = await runExpand(fixture, {
      promptName: "project-scoped-skill",
      userId: fixture.actorUserId,
      projectId,
    });

    expect(withoutProject.objectives).toEqual(["Team-wide objective"]);
    expect(withProject.objectives.sort()).toEqual(["Project-scoped objective", "Team-wide objective"].sort());
    // Policies applied are completely unaffected by projectId.
    expect(withoutProject.appliedPolicies).toEqual(["team-policy"]);
    expect(withProject.appliedPolicies).toEqual(["team-policy"]);
    expect(withoutProject.content.startsWith("Team policy content.")).toBe(true);
    expect(withProject.content.startsWith("Team policy content.")).toBe(true);
  });
});
