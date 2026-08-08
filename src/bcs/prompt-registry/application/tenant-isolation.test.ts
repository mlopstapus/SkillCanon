import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, it } from "vitest";
import type { UserSummary } from "@/bcs/identity-access";
import { withTenantContext } from "@/shared/db/tenant-context";
import { startTestDb, type TestDb } from "@/shared/db/test-helpers";
import { assertCrossTenantDenied } from "@/shared/testing/tenant-isolation";
import { addCollaboratorTeam } from "./add-collaborator-team";
import { assignSkillToProject } from "./assign-skill-to-project";
import { forkSkill } from "./fork-skill";
import { getProject } from "./get-project";
import { getPromptById } from "./get-prompt-by-id";
import { getPromptVersion } from "./get-prompt-version";
import { getSubscription } from "./get-subscription";
import { listProjectTeams } from "./list-project-teams";
import { listRequiredSkillsForProject } from "./list-required-skills-for-project";
import {
  createTestProject,
  makeProjectFixtureOrg,
  verifierFor,
} from "./project-test-helpers";
import { makeProjectTeamFixtureOrg } from "./project-team-test-helpers";
import { createPromptInOrg, makePromptFixtureOrg } from "./prompt-test-helpers";
import { publishVersion } from "./publish-version";
import {
  createTestSkillOwnedByTeam,
  createTestSkillOwnedByUser,
  makeSubscriptionFixtureOrg,
} from "./subscription-test-helpers";
import { removeCollaboratorTeam } from "./remove-collaborator-team";
import { subscribeSkill } from "./subscribe-skill";
import { unassignSkillFromProject } from "./unassign-skill-from-project";
import { unsubscribeSkill } from "./unsubscribe-skill";
import { updateProject } from "./update-project";

/**
 * One `describe` per resource type this feature (022-prompt-registry-
 * tenant-isolation) covers, each proving denial via the shared helper
 * (contracts/tenant-isolation-test-helper.md, FR-018/FR-019):
 *   1. through the real, app-layer-scoped accessor (M1)
 *   2. through a raw, deliberately-unfiltered query, relying on RLS alone (M2)
 * `prompt_versions` has no application-layer write path (immutable by
 * design — see schema.ts) so its coverage is app-layer read + RLS-alone
 * read/write only.
 */
describe("prompt registry tenant isolation (022-prompt-registry-tenant-isolation)", () => {
  let testDb: TestDb;

  beforeAll(async () => {
    testDb = await startTestDb();
  }, 120_000);

  afterAll(async () => {
    await testDb.teardown();
  });

  describe("projects", () => {
    it("denies cross-organization access by id via app-layer filters and RLS alone", async () => {
      const orgA = await makeProjectFixtureOrg(testDb);
      const orgB = await makeProjectFixtureOrg(testDb);
      const project = await createTestProject(testDb, orgB);

      await assertCrossTenantDenied({
        actingAsOrg: orgA.organizationId,
        resourceOwnedByOrg: orgB.organizationId,
        resourceId: project.id,
        fetchResourceById: (id) =>
          withTenantContext(testDb.appDb, orgA.organizationId, (tx) =>
            getProject(tx, orgA.organizationId, id),
          ),
      });

      await assertCrossTenantDenied({
        actingAsOrg: orgA.organizationId,
        resourceOwnedByOrg: orgB.organizationId,
        resourceId: project.id,
        fetchResourceById: (id) =>
          withTenantContext(testDb.appDb, orgA.organizationId, (tx) =>
            updateProject(tx, orgA.actor, id, { name: "Cross-org update" }, verifierFor(orgA)),
          ),
      });

      await assertCrossTenantDenied({
        actingAsOrg: orgA.organizationId,
        resourceOwnedByOrg: orgB.organizationId,
        resourceId: project.id,
        fetchResourceById: (id) =>
          withTenantContext(testDb.appDb, orgA.organizationId, async (tx) =>
            Array.from(await tx.execute(sql`select id from prompt_registry.projects where id = ${id}`)),
          ),
      });

      await assertCrossTenantDenied({
        actingAsOrg: orgA.organizationId,
        resourceOwnedByOrg: orgB.organizationId,
        resourceId: project.id,
        fetchResourceById: (id) =>
          withTenantContext(testDb.appDb, orgA.organizationId, async (tx) =>
            Array.from(
              await tx.execute(sql`
                update prompt_registry.projects
                set name = 'Cross-org update'
                where id = ${id}
                returning id
              `),
            ),
          ),
      });
    });
  });

  describe("project_teams", () => {
    it("denies cross-organization access to a project's collaborator-team link via app-layer filters and RLS alone", async () => {
      const orgA = await makeProjectTeamFixtureOrg(testDb);
      const orgB = await makeProjectTeamFixtureOrg(testDb);
      const collaboratorTeamLink = await withTenantContext(testDb.appDb, orgB.organizationId, (tx) =>
        addCollaboratorTeam(tx, orgB.ownerTeamAdmin, orgB.projectId, {
          teamId: orgB.collaboratorTeamId,
        }),
      );

      // App-layer accessors for this resource are keyed by the owning
      // project's id, not the project_teams row's own id (data-model.md) —
      // matches the spec's Acceptance Scenario 2 wording ("on that project
      // by exact ID").
      await assertCrossTenantDenied({
        actingAsOrg: orgA.organizationId,
        resourceOwnedByOrg: orgB.organizationId,
        resourceId: orgB.projectId,
        fetchResourceById: (id) =>
          withTenantContext(testDb.appDb, orgA.organizationId, (tx) =>
            listProjectTeams(tx, orgA.organizationId, id),
          ),
      });

      await assertCrossTenantDenied({
        actingAsOrg: orgA.organizationId,
        resourceOwnedByOrg: orgB.organizationId,
        resourceId: orgB.projectId,
        fetchResourceById: (id) =>
          withTenantContext(testDb.appDb, orgA.organizationId, (tx) =>
            removeCollaboratorTeam(tx, orgA.ownerTeamAdmin, id, { teamId: orgB.collaboratorTeamId }),
          ),
      });

      await assertCrossTenantDenied({
        actingAsOrg: orgA.organizationId,
        resourceOwnedByOrg: orgB.organizationId,
        resourceId: collaboratorTeamLink.id,
        fetchResourceById: (id) =>
          withTenantContext(testDb.appDb, orgA.organizationId, async (tx) =>
            Array.from(
              await tx.execute(sql`select id from prompt_registry.project_teams where id = ${id}`),
            ),
          ),
      });

      await assertCrossTenantDenied({
        actingAsOrg: orgA.organizationId,
        resourceOwnedByOrg: orgB.organizationId,
        resourceId: collaboratorTeamLink.id,
        fetchResourceById: (id) =>
          withTenantContext(testDb.appDb, orgA.organizationId, async (tx) =>
            Array.from(
              await tx.execute(sql`
                delete from prompt_registry.project_teams
                where id = ${id}
                returning id
              `),
            ),
          ),
      });
    });
  });

  describe("prompts", () => {
    it("denies cross-organization access by id via app-layer filters and RLS alone", async () => {
      const orgA = await makePromptFixtureOrg(testDb);
      const orgB = await makePromptFixtureOrg(testDb);
      const prompt = await createPromptInOrg(testDb, orgB);
      const actingUser: UserSummary = {
        id: orgA.actorUserId,
        orgId: orgA.organizationId,
        teamId: orgA.teamId,
        role: "admin",
        email: "actor@example.com",
      };

      await assertCrossTenantDenied({
        actingAsOrg: orgA.organizationId,
        resourceOwnedByOrg: orgB.organizationId,
        resourceId: prompt.id,
        fetchResourceById: (id) =>
          withTenantContext(testDb.appDb, orgA.organizationId, (tx) =>
            getPromptById(tx, orgA.organizationId, id),
          ),
      });

      // forkSkill is the app-layer entrypoint that both reads a prompt by
      // exact id and immediately attempts a write gated on that read
      // (SourceSkillNotFoundError) — prompts have no direct
      // "update-by-id" service, so this is the write-shaped accessor.
      await assertCrossTenantDenied({
        actingAsOrg: orgA.organizationId,
        resourceOwnedByOrg: orgB.organizationId,
        resourceId: prompt.id,
        fetchResourceById: (id) =>
          withTenantContext(testDb.appDb, orgA.organizationId, (tx) =>
            forkSkill(tx, actingUser, id, { ownerType: "user", ownerId: actingUser.id }),
          ),
      });

      await assertCrossTenantDenied({
        actingAsOrg: orgA.organizationId,
        resourceOwnedByOrg: orgB.organizationId,
        resourceId: prompt.id,
        fetchResourceById: (id) =>
          withTenantContext(testDb.appDb, orgA.organizationId, async (tx) =>
            Array.from(await tx.execute(sql`select id from prompt_registry.prompts where id = ${id}`)),
          ),
      });

      await assertCrossTenantDenied({
        actingAsOrg: orgA.organizationId,
        resourceOwnedByOrg: orgB.organizationId,
        resourceId: prompt.id,
        fetchResourceById: (id) =>
          withTenantContext(testDb.appDb, orgA.organizationId, async (tx) =>
            Array.from(
              await tx.execute(sql`
                update prompt_registry.prompts
                set description = 'Cross-org update'
                where id = ${id}
                returning id
              `),
            ),
          ),
      });
    });
  });

  describe("prompt_versions", () => {
    it("denies cross-organization access by id via app-layer read and RLS alone (no app-layer write path — immutable by design)", async () => {
      const orgA = await makePromptFixtureOrg(testDb);
      const orgB = await makePromptFixtureOrg(testDb);
      const prompt = await createPromptInOrg(testDb, orgB);
      const version = await withTenantContext(testDb.appDb, orgB.organizationId, (tx) =>
        publishVersion(tx, orgB.actor, {
          organizationId: orgB.organizationId,
          promptName: prompt.name,
          version: "v1",
          mainFile: { content: "Instructions." },
        }),
      );

      await assertCrossTenantDenied({
        actingAsOrg: orgA.organizationId,
        resourceOwnedByOrg: orgB.organizationId,
        resourceId: version.id,
        fetchResourceById: (id) =>
          withTenantContext(testDb.appDb, orgA.organizationId, (tx) =>
            getPromptVersion(tx, orgA.organizationId, id),
          ),
      });

      await assertCrossTenantDenied({
        actingAsOrg: orgA.organizationId,
        resourceOwnedByOrg: orgB.organizationId,
        resourceId: version.id,
        fetchResourceById: (id) =>
          withTenantContext(testDb.appDb, orgA.organizationId, async (tx) =>
            Array.from(
              await tx.execute(sql`select id from prompt_registry.prompt_versions where id = ${id}`),
            ),
          ),
      });

      await assertCrossTenantDenied({
        actingAsOrg: orgA.organizationId,
        resourceOwnedByOrg: orgB.organizationId,
        resourceId: version.id,
        fetchResourceById: (id) =>
          withTenantContext(testDb.appDb, orgA.organizationId, async (tx) =>
            Array.from(
              await tx.execute(sql`
                update prompt_registry.prompt_versions
                set system_template = 'Cross-org update'
                where id = ${id}
                returning id
              `),
            ),
          ),
      });
    });
  });

  describe("prompt_version_files", () => {
    it("denies cross-organization access by id via app-layer read (through its parent version) and RLS alone (no app-layer write path — immutable by design)", async () => {
      const orgA = await makePromptFixtureOrg(testDb);
      const orgB = await makePromptFixtureOrg(testDb);
      const prompt = await createPromptInOrg(testDb, orgB);
      const version = await withTenantContext(testDb.appDb, orgB.organizationId, (tx) =>
        publishVersion(tx, orgB.actor, {
          organizationId: orgB.organizationId,
          promptName: prompt.name,
          version: "v1",
          mainFile: { content: "Instructions." },
          supportingFiles: [{ name: "example.md", content: "An example." }],
        }),
      );
      const mainFile = version.files.find((f) => f.isMain);
      if (!mainFile) {
        throw new Error("Fixture version has no main file.");
      }

      // No app-layer accessor is keyed by a file's own id — files are only
      // ever read as part of their parent version's `files` array (same
      // "no direct by-id path" shape as `prompt_versions` itself). Proving
      // `getPromptVersion` denies cross-org access to the parent version
      // transitively proves its files aren't leaked either.
      await assertCrossTenantDenied({
        actingAsOrg: orgA.organizationId,
        resourceOwnedByOrg: orgB.organizationId,
        resourceId: version.id,
        fetchResourceById: (id) =>
          withTenantContext(testDb.appDb, orgA.organizationId, (tx) =>
            getPromptVersion(tx, orgA.organizationId, id),
          ),
      });

      await assertCrossTenantDenied({
        actingAsOrg: orgA.organizationId,
        resourceOwnedByOrg: orgB.organizationId,
        resourceId: mainFile.id,
        fetchResourceById: (id) =>
          withTenantContext(testDb.appDb, orgA.organizationId, async (tx) =>
            Array.from(
              await tx.execute(sql`select id from prompt_registry.prompt_version_files where id = ${id}`),
            ),
          ),
      });

      await assertCrossTenantDenied({
        actingAsOrg: orgA.organizationId,
        resourceOwnedByOrg: orgB.organizationId,
        resourceId: mainFile.id,
        fetchResourceById: (id) =>
          withTenantContext(testDb.appDb, orgA.organizationId, async (tx) =>
            Array.from(
              await tx.execute(sql`
                update prompt_registry.prompt_version_files
                set content = 'Cross-org update'
                where id = ${id}
                returning id
              `),
            ),
          ),
      });
    });
  });

  describe("subscriptions", () => {
    it("denies cross-organization access by id via app-layer filters and RLS alone", async () => {
      const fixture = await makeSubscriptionFixtureOrg(testDb);
      const skill = await createTestSkillOwnedByUser(testDb, fixture.organizationId, fixture.userA.id);
      const subscription = await withTenantContext(testDb.appDb, fixture.organizationId, (tx) =>
        subscribeSkill(tx, fixture.userB, skill.id, {
          subscriberType: "user",
          subscriberId: fixture.userB.id,
        }),
      );

      await assertCrossTenantDenied({
        actingAsOrg: fixture.otherOrgId,
        resourceOwnedByOrg: fixture.organizationId,
        resourceId: subscription.id,
        fetchResourceById: (id) =>
          withTenantContext(testDb.appDb, fixture.otherOrgId, (tx) =>
            getSubscription(tx, fixture.otherOrgId, id),
          ),
      });

      await assertCrossTenantDenied({
        actingAsOrg: fixture.otherOrgId,
        resourceOwnedByOrg: fixture.organizationId,
        resourceId: subscription.id,
        fetchResourceById: (id) =>
          withTenantContext(testDb.appDb, fixture.otherOrgId, (tx) =>
            unsubscribeSkill(tx, fixture.otherOrgUser, id),
          ),
      });

      await assertCrossTenantDenied({
        actingAsOrg: fixture.otherOrgId,
        resourceOwnedByOrg: fixture.organizationId,
        resourceId: subscription.id,
        fetchResourceById: (id) =>
          withTenantContext(testDb.appDb, fixture.otherOrgId, async (tx) =>
            Array.from(
              await tx.execute(sql`select id from prompt_registry.subscriptions where id = ${id}`),
            ),
          ),
      });

      await assertCrossTenantDenied({
        actingAsOrg: fixture.otherOrgId,
        resourceOwnedByOrg: fixture.organizationId,
        resourceId: subscription.id,
        fetchResourceById: (id) =>
          withTenantContext(testDb.appDb, fixture.otherOrgId, async (tx) =>
            Array.from(
              await tx.execute(sql`
                delete from prompt_registry.subscriptions
                where id = ${id}
                returning id
              `),
            ),
          ),
      });
    });
  });

  describe("project_skill_assignments", () => {
    it("denies cross-organization access by id via app-layer filters and RLS alone", async () => {
      const orgA = await makeProjectTeamFixtureOrg(testDb);
      const orgB = await makeProjectTeamFixtureOrg(testDb);
      const skill = await createTestSkillOwnedByTeam(testDb, orgB.organizationId, orgB.ownerTeamId);
      const assignment = await withTenantContext(testDb.appDb, orgB.organizationId, (tx) =>
        assignSkillToProject(tx, orgB.ownerTeamAdmin, orgB.projectId, skill.id, {
          requirement: "required",
        }),
      );

      // App-layer accessors for this resource are keyed by the owning
      // project's id (+ skill id for the write), same shape as
      // project_teams — matches the spec's Edge Cases wording for
      // indirectly-scoped resources.
      await assertCrossTenantDenied({
        actingAsOrg: orgA.organizationId,
        resourceOwnedByOrg: orgB.organizationId,
        resourceId: orgB.projectId,
        fetchResourceById: (id) =>
          withTenantContext(testDb.appDb, orgA.organizationId, (tx) =>
            listRequiredSkillsForProject(tx, orgA.organizationId, id),
          ),
      });

      await assertCrossTenantDenied({
        actingAsOrg: orgA.organizationId,
        resourceOwnedByOrg: orgB.organizationId,
        resourceId: orgB.projectId,
        fetchResourceById: (id) =>
          withTenantContext(testDb.appDb, orgA.organizationId, (tx) =>
            unassignSkillFromProject(tx, orgA.ownerTeamAdmin, id, skill.id),
          ),
      });

      await assertCrossTenantDenied({
        actingAsOrg: orgA.organizationId,
        resourceOwnedByOrg: orgB.organizationId,
        resourceId: assignment.id,
        fetchResourceById: (id) =>
          withTenantContext(testDb.appDb, orgA.organizationId, async (tx) =>
            Array.from(
              await tx.execute(
                sql`select id from prompt_registry.project_skill_assignments where id = ${id}`,
              ),
            ),
          ),
      });

      await assertCrossTenantDenied({
        actingAsOrg: orgA.organizationId,
        resourceOwnedByOrg: orgB.organizationId,
        resourceId: assignment.id,
        fetchResourceById: (id) =>
          withTenantContext(testDb.appDb, orgA.organizationId, async (tx) =>
            Array.from(
              await tx.execute(sql`
                delete from prompt_registry.project_skill_assignments
                where id = ${id}
                returning id
              `),
            ),
          ),
      });
    });
  });
});
