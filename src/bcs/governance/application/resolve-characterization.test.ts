/**
 * Characterization test (005-governance/003-hierarchical-resolution-engine):
 * asserts the TypeScript `resolveEffectivePolicies`/`resolveAllPolicies`/
 * `resolveEffectiveObjectives`/`resolveAllObjectives` produce output
 * matching the REAL legacy `resolve_effective`/`resolve_all_policies`
 * (`legacy/backend/src/skillcanon_server/services/policy_service.py`) and
 * `resolve_effective`/`resolve_all_objectives`
 * (`.../services/objective_service.py`) for the same fixture scenarios.
 *
 * Scope note (PDR-016): legacy policy resolution accepts an optional
 * `project_id` that adds an independent project-scoped policy layer; the
 * new TypeScript `Policy` model dropped project scope entirely (policy is
 * purely team + invoking-user scoped now — see `resolveEffectivePolicies`'s
 * own signature, which has no `projectId` parameter at all). The policy
 * scenarios below never exercise it, matching this repo's own accepted,
 * documented divergence — not a silently-dropped case. `Objective` kept its
 * `projectId` scope unchanged, so the objective scenarios do exercise it.
 *
 * The legacy side is never re-run from this test (no Python/`uv` dependency
 * at `vitest` time) — `legacy/backend/scratch/governance_characterization_harness.py`
 * is run once via `uv run` to *record* its output to
 * `governance_characterization_output.json` in the same directory, and this
 * test reads that recorded JSON. Literal fixture values (team names, policy
 * names/priorities/content, objective titles) are hand-mirrored exactly
 * between the two sides — see the harness's own module docstring.
 */
import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { withTenantContext } from "@/shared/db/tenant-context";
import { startTestDb, type TestDb } from "@/shared/db/test-helpers";
import { resolveEffectivePolicies } from "./resolve-effective-policies";
import { resolveAllPolicies } from "./resolve-all-policies";
import { resolveEffectiveObjectives } from "./resolve-effective-objectives";
import { resolveAllObjectives } from "./resolve-all-objectives";
import {
  createPolicyFixtureTeam,
  createPolicyFixtureUser,
  makePolicyFixtureOrg,
  type PolicyFixtureOrg,
} from "./policy-test-helpers";
import {
  createObjectiveFixtureTeam,
  createObjectiveFixtureUser,
  insertObjectiveRow,
  makeObjectiveFixtureOrg,
  type ObjectiveFixtureOrg,
} from "./objective-test-helpers";

const HARNESS_OUTPUT_PATH = fileURLToPath(
  new URL("../../../../legacy/backend/scratch/governance_characterization_output.json", import.meta.url),
);

interface HarnessPolicy {
  name: string;
  enforcementType: string;
  content: string;
  priority: number;
  isInherited: boolean;
}

interface HarnessEffectivePolicies {
  inherited: HarnessPolicy[];
  local: HarnessPolicy[];
}

interface HarnessObjective {
  title: string;
  isInherited: boolean;
}

interface HarnessEffectiveObjectives {
  inherited: HarnessObjective[];
  local: HarnessObjective[];
}

interface HarnessOutput {
  policyBasicLocal: HarnessEffectivePolicies;
  policyInheritedChain: HarnessEffectivePolicies;
  policyTieBreak_all: HarnessPolicy[];
  objectiveInheritedChain: HarnessEffectiveObjectives;
  objectiveUserPersonal: HarnessEffectiveObjectives;
  objectiveProjectScoped_without: HarnessEffectiveObjectives;
  objectiveProjectScoped_with: HarnessEffectiveObjectives;
  objectiveCombined_all: string[];
}

function loadHarnessOutput(): HarnessOutput {
  const raw = readFileSync(HARNESS_OUTPUT_PATH, "utf-8");
  return JSON.parse(raw) as HarnessOutput;
}

async function insertPolicy(
  testDb: TestDb,
  params: { organizationId: string; teamId: string; name: string; enforcementType: string; content: string; priority: number; isActive?: boolean },
): Promise<void> {
  await testDb.ownerDb.execute(sql`
    insert into governance.policies (id, organization_id, team_id, name, enforcement_type, content, priority, is_active)
    values (
      ${randomUUID()},
      ${params.organizationId},
      ${params.teamId},
      ${params.name},
      ${params.enforcementType},
      ${params.content},
      ${params.priority},
      ${params.isActive ?? true}
    )
  `);
}

/** Strips id/organizationId/teamId/createdAt — only the fields the harness also records. */
function toHarnessPolicyShape(p: { name: string; enforcementType: string; content: string; priority: number; isInherited: boolean }): HarnessPolicy {
  return { name: p.name, enforcementType: p.enforcementType, content: p.content, priority: p.priority, isInherited: p.isInherited };
}

function toHarnessObjectiveShape(o: { title: string; isInherited: boolean }): HarnessObjective {
  return { title: o.title, isInherited: o.isInherited };
}

describe("governance resolution — characterization parity against legacy resolve_effective/resolve_all_* (005-governance/003)", () => {
  let testDb: TestDb;
  let harness: HarnessOutput;

  beforeAll(async () => {
    testDb = await startTestDb();
    harness = loadHarnessOutput();
  }, 120_000);

  afterAll(async () => {
    await testDb.teardown();
  });

  describe("policies", () => {
    it("policyBasicLocal: single team, active policies sorted by priority desc, inactive excluded", async () => {
      const fixture = await makePolicyFixtureOrg(testDb);
      await insertPolicy(testDb, { organizationId: fixture.organizationId, teamId: fixture.teamId, name: "policy-mid", enforcementType: "prepend", content: "Mid content.", priority: 10 });
      await insertPolicy(testDb, { organizationId: fixture.organizationId, teamId: fixture.teamId, name: "policy-low", enforcementType: "append", content: "Low content.", priority: 5 });
      await insertPolicy(testDb, { organizationId: fixture.organizationId, teamId: fixture.teamId, name: "policy-high", enforcementType: "inject", content: "High content.", priority: 20 });
      await insertPolicy(testDb, { organizationId: fixture.organizationId, teamId: fixture.teamId, name: "policy-inactive", enforcementType: "prepend", content: "Should not appear.", priority: 999, isActive: false });

      const effective = await withTenantContext(testDb.appDb, fixture.organizationId, (tx) => resolveEffectivePolicies(tx, fixture.actor, fixture.userId));

      expect(effective.inherited.map(toHarnessPolicyShape)).toEqual(harness.policyBasicLocal.inherited);
      expect(effective.local.map(toHarnessPolicyShape)).toEqual(harness.policyBasicLocal.local);
    });

    it("policyInheritedChain: 3-level chain, own team's policy is local, ancestors' are inherited (sorted desc)", async () => {
      const fixture = await makePolicyFixtureOrg(testDb);
      const root = await createPolicyFixtureTeam(testDb, fixture, { name: "policy-chain-root" });
      const mid = await createPolicyFixtureTeam(testDb, fixture, { name: "policy-chain-mid", parentTeamId: root });
      const leaf = await createPolicyFixtureTeam(testDb, fixture, { name: "policy-chain-leaf", parentTeamId: mid });
      const leafUser = await createPolicyFixtureUser(testDb, fixture, leaf);

      await insertPolicy(testDb, { organizationId: fixture.organizationId, teamId: root, name: "root-policy", enforcementType: "prepend", content: "Root content.", priority: 1 });
      await insertPolicy(testDb, { organizationId: fixture.organizationId, teamId: mid, name: "mid-policy", enforcementType: "append", content: "Mid content.", priority: 2 });
      await insertPolicy(testDb, { organizationId: fixture.organizationId, teamId: leaf, name: "leaf-policy", enforcementType: "inject", content: "Leaf content.", priority: 3 });

      const effective = await withTenantContext(testDb.appDb, fixture.organizationId, (tx) => resolveEffectivePolicies(tx, fixture.actor, leafUser));

      expect(effective.inherited.map(toHarnessPolicyShape)).toEqual(harness.policyInheritedChain.inherited);
      expect(effective.local.map(toHarnessPolicyShape)).toEqual(harness.policyInheritedChain.local);
    });

    it("policyTieBreak: an inherited policy and a local policy at the same priority resolve with inherited winning the tie", async () => {
      const fixture = await makePolicyFixtureOrg(testDb);
      const parent = await createPolicyFixtureTeam(testDb, fixture, { name: "policy-tie-parent" });
      const child = await createPolicyFixtureTeam(testDb, fixture, { name: "policy-tie-child", parentTeamId: parent });
      const childUser = await createPolicyFixtureUser(testDb, fixture, child);

      await insertPolicy(testDb, { organizationId: fixture.organizationId, teamId: parent, name: "inherited-tie", enforcementType: "prepend", content: "Inherited tie content.", priority: 10 });
      await insertPolicy(testDb, { organizationId: fixture.organizationId, teamId: child, name: "local-tie", enforcementType: "append", content: "Local tie content.", priority: 10 });

      const all = await withTenantContext(testDb.appDb, fixture.organizationId, (tx) => resolveAllPolicies(tx, fixture.actor, childUser));

      expect(all.map(toHarnessPolicyShape)).toEqual(harness.policyTieBreak_all);
    });
  });

  describe("objectives", () => {
    async function makeObjOrg(): Promise<ObjectiveFixtureOrg> {
      return makeObjectiveFixtureOrg(testDb);
    }

    it("objectiveInheritedChain: 3-level chain, own team's objective is local, ancestors' are inherited (chain order)", async () => {
      const fixture = await makeObjOrg();
      const root = await createObjectiveFixtureTeam(testDb, fixture, { name: "objective-chain-root" });
      const mid = await createObjectiveFixtureTeam(testDb, fixture, { name: "objective-chain-mid", parentTeamId: root });
      const leaf = await createObjectiveFixtureTeam(testDb, fixture, { name: "objective-chain-leaf", parentTeamId: mid });
      const leafUser = await createObjectiveFixtureUser(testDb, fixture, leaf);

      await insertObjectiveRow(testDb, { organizationId: fixture.organizationId, teamId: root, title: "root-objective", createdAt: new Date("2026-01-01T00:00:00Z") });
      await insertObjectiveRow(testDb, { organizationId: fixture.organizationId, teamId: mid, title: "mid-objective", createdAt: new Date("2026-01-01T00:00:01Z") });
      await insertObjectiveRow(testDb, { organizationId: fixture.organizationId, teamId: leaf, title: "leaf-objective", createdAt: new Date("2026-01-01T00:00:02Z") });

      const effective = await withTenantContext(testDb.appDb, fixture.organizationId, (tx) => resolveEffectiveObjectives(tx, fixture.actor, leafUser));

      expect(effective.inherited.map(toHarnessObjectiveShape)).toEqual(harness.objectiveInheritedChain.inherited);
      expect(effective.local.map(toHarnessObjectiveShape)).toEqual(harness.objectiveInheritedChain.local);
    });

    it("objectiveUserPersonal: own team's objective plus the user's personal objective both land in local, team first", async () => {
      const fixture = await makeObjOrg();
      const team = await createObjectiveFixtureTeam(testDb, fixture, { name: "objective-personal-team" });
      const user = await createObjectiveFixtureUser(testDb, fixture, team);

      await insertObjectiveRow(testDb, { organizationId: fixture.organizationId, teamId: team, title: "team-objective", createdAt: new Date("2026-01-01T00:00:10Z") });
      await insertObjectiveRow(testDb, { organizationId: fixture.organizationId, userId: user, title: "personal-objective", createdAt: new Date("2026-01-01T00:00:11Z") });

      const effective = await withTenantContext(testDb.appDb, fixture.organizationId, (tx) => resolveEffectiveObjectives(tx, fixture.actor, user));

      expect(effective.inherited.map(toHarnessObjectiveShape)).toEqual(harness.objectiveUserPersonal.inherited);
      expect(effective.local.map(toHarnessObjectiveShape)).toEqual(harness.objectiveUserPersonal.local);
    });

    it("objectiveProjectScoped: a project objective appears only when projectId is passed", async () => {
      const fixture = await makeObjOrg();
      const team = await createObjectiveFixtureTeam(testDb, fixture, { name: "objective-project-team" });
      const user = await createObjectiveFixtureUser(testDb, fixture, team);
      const projectId = randomUUID();

      await insertObjectiveRow(testDb, { organizationId: fixture.organizationId, projectId, title: "project-objective", createdAt: new Date("2026-01-01T00:00:20Z") });

      const without = await withTenantContext(testDb.appDb, fixture.organizationId, (tx) => resolveEffectiveObjectives(tx, fixture.actor, user));
      const withProject = await withTenantContext(testDb.appDb, fixture.organizationId, (tx) => resolveEffectiveObjectives(tx, fixture.actor, user, projectId));

      expect(without.inherited.map(toHarnessObjectiveShape)).toEqual(harness.objectiveProjectScoped_without.inherited);
      expect(without.local.map(toHarnessObjectiveShape)).toEqual(harness.objectiveProjectScoped_without.local);
      expect(withProject.inherited.map(toHarnessObjectiveShape)).toEqual(harness.objectiveProjectScoped_with.inherited);
      expect(withProject.local.map(toHarnessObjectiveShape)).toEqual(harness.objectiveProjectScoped_with.local);
    });

    it("objectiveCombined: resolveAllObjectives flattens inherited-then-local (team, personal, project order) matching legacy exactly", async () => {
      const fixture = await makeObjOrg();
      const root = await createObjectiveFixtureTeam(testDb, fixture, { name: "objective-combined-root" });
      const leaf = await createObjectiveFixtureTeam(testDb, fixture, { name: "objective-combined-leaf", parentTeamId: root });
      const user = await createObjectiveFixtureUser(testDb, fixture, leaf);
      const projectId = randomUUID();

      await insertObjectiveRow(testDb, { organizationId: fixture.organizationId, teamId: root, title: "combined-root-objective", createdAt: new Date("2026-01-01T00:00:30Z") });
      await insertObjectiveRow(testDb, { organizationId: fixture.organizationId, teamId: leaf, title: "combined-leaf-objective", createdAt: new Date("2026-01-01T00:00:31Z") });
      await insertObjectiveRow(testDb, { organizationId: fixture.organizationId, userId: user, title: "combined-personal-objective", createdAt: new Date("2026-01-01T00:00:32Z") });
      await insertObjectiveRow(testDb, { organizationId: fixture.organizationId, projectId, title: "combined-project-objective", createdAt: new Date("2026-01-01T00:00:33Z") });

      const allTitles = await withTenantContext(testDb.appDb, fixture.organizationId, (tx) => resolveAllObjectives(tx, fixture.actor, user, projectId));

      expect(allTitles).toEqual(harness.objectiveCombined_all);
    });
  });
});
