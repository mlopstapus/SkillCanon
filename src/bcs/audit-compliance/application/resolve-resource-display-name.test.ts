import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { withTenantContext } from "@/shared/db/tenant-context";
import { startTestDb, type TestDb } from "@/shared/db/test-helpers";
import { createApiKey, inviteUser, type UserSummary } from "@/bcs/identity-access";
import { createObjective, createPolicy } from "@/bcs/governance";
import { addProjectMember, createProject, createPrompt, publishVersion } from "@/bcs/prompt-registry";
import { resolveResourceDisplayName } from "./resolve-resource-display-name";

describe("resolveResourceDisplayName", () => {
  let testDb: TestDb;

  beforeAll(async () => {
    testDb = await startTestDb();
  }, 120_000);

  afterAll(async () => {
    await testDb.teardown();
  });

  async function makeFixture() {
    const organizationId = randomUUID();
    const teamId = randomUUID();
    const adminId = randomUUID();
    const otherUserId = randomUUID();
    const orgSlug = `org-${randomUUID()}`;

    await testDb.ownerDb.execute(sql`
      insert into identity_access.organizations (id, name, slug)
      values (${organizationId}, ${`Org ${orgSlug}`}, ${orgSlug})
    `);
    await testDb.ownerDb.execute(sql`
      insert into identity_access.teams (id, organization_id, name, slug)
      values (${teamId}, ${organizationId}, 'Root', ${`team-${randomUUID()}`})
    `);
    await testDb.ownerDb.execute(sql`
      insert into identity_access.users (id, organization_id, team_id, username, display_name, email, role, is_active)
      values
        (${adminId}, ${organizationId}, ${teamId}, ${`admin-${randomUUID()}`}, 'Admin User', ${`${randomUUID()}@example.com`}, 'admin', true),
        (${otherUserId}, ${organizationId}, ${teamId}, ${`member-${randomUUID()}`}, 'Member User', ${`${randomUUID()}@example.com`}, 'member', true)
    `);

    const admin: UserSummary = { id: adminId, orgId: organizationId, teamId, role: "admin", email: `${adminId}@example.com` };
    return { organizationId, teamId, adminId, otherUserId, admin };
  }

  it("resolves a team's real name", async () => {
    const { organizationId, teamId, adminId } = await makeFixture();

    const result = await withTenantContext(testDb.appDb, organizationId, (tx) =>
      resolveResourceDisplayName(tx, organizationId, adminId, "team", teamId),
    );

    expect(result).toEqual({ name: "Root", resolved: true });
  });

  it("resolves an organization's real name", async () => {
    const { organizationId, adminId } = await makeFixture();

    const result = await withTenantContext(testDb.appDb, organizationId, (tx) =>
      resolveResourceDisplayName(tx, organizationId, adminId, "organization", organizationId),
    );

    expect(result.resolved).toBe(true);
    expect(result.name).toContain("Org ");
  });

  it("resolves a user's display name", async () => {
    const { organizationId, adminId } = await makeFixture();

    const result = await withTenantContext(testDb.appDb, organizationId, (tx) =>
      resolveResourceDisplayName(tx, organizationId, adminId, "user", adminId),
    );

    expect(result).toEqual({ name: "Admin User", resolved: true });
  });

  it("resolves a policy's real name", async () => {
    const { organizationId, teamId, adminId } = await makeFixture();
    const policy = await withTenantContext(testDb.appDb, organizationId, (tx) =>
      createPolicy(
        tx,
        { organizationId, userId: adminId },
        { teamId, name: "Require tests", enforcementType: "prepend", content: "Always test." },
        { teamBelongsToOrganization: async () => true },
      ),
    );

    const result = await withTenantContext(testDb.appDb, organizationId, (tx) =>
      resolveResourceDisplayName(tx, organizationId, adminId, "policy", policy.id),
    );

    expect(result).toEqual({ name: "Require tests", resolved: true });
  });

  it("resolves an objective's title as its name", async () => {
    const { organizationId, teamId, adminId } = await makeFixture();
    const objective = await withTenantContext(testDb.appDb, organizationId, (tx) =>
      createObjective(
        tx,
        { organizationId, userId: adminId },
        { teamId, title: "reduce-inference-cost" },
        { teamBelongsToOrganization: async () => true },
      ),
    );

    const result = await withTenantContext(testDb.appDb, organizationId, (tx) =>
      resolveResourceDisplayName(tx, organizationId, adminId, "objective", objective.id),
    );

    expect(result).toEqual({ name: "reduce-inference-cost", resolved: true });
  });

  it("resolves a project's real name", async () => {
    const { organizationId, teamId, adminId } = await makeFixture();
    const project = await withTenantContext(testDb.appDb, organizationId, (tx) =>
      createProject(
        tx,
        { organizationId, userId: adminId },
        { organizationId, teamId, name: "incident-postmortem", slug: `slug-${randomUUID()}` },
        {
          organizationExists: async () => true,
          teamBelongsToOrganization: async () => true,
          userBelongsToOrganization: async () => true,
        },
      ),
    );

    const result = await withTenantContext(testDb.appDb, organizationId, (tx) =>
      resolveResourceDisplayName(tx, organizationId, adminId, "project", project.id),
    );

    expect(result).toEqual({ name: "incident-postmortem", resolved: true });
  });

  it("resolves an invitation's email as its name", async () => {
    const { organizationId, teamId, admin } = await makeFixture();
    const email = `erin-${randomUUID()}@example.com`;
    const invitation = await withTenantContext(testDb.appDb, organizationId, (tx) =>
      inviteUser(tx, admin, { teamId, email, role: "member" }),
    );

    const result = await withTenantContext(testDb.appDb, organizationId, (tx) =>
      resolveResourceDisplayName(tx, organizationId, admin.id, "invitation", invitation.id),
    );

    expect(result).toEqual({ name: email, resolved: true });
  });

  it("resolves an api key's name", async () => {
    const { organizationId, admin } = await makeFixture();
    const key = await withTenantContext(testDb.appDb, organizationId, (tx) =>
      createApiKey(tx, admin, { name: "staging-ci", scopes: ["prompts:read"] }),
    );

    const result = await withTenantContext(testDb.appDb, organizationId, (tx) =>
      resolveResourceDisplayName(tx, organizationId, admin.id, "api_key", key.id),
    );

    expect(result).toEqual({ name: "staging-ci", resolved: true });
  });

  it("resolves a prompt's name", async () => {
    const { organizationId, adminId } = await makeFixture();
    const prompt = await withTenantContext(testDb.appDb, organizationId, (tx) =>
      createPrompt(tx, { organizationId, userId: adminId }, { organizationId, name: "pin-model-version" }),
    );

    const result = await withTenantContext(testDb.appDb, organizationId, (tx) =>
      resolveResourceDisplayName(tx, organizationId, adminId, "prompt", prompt.id),
    );

    expect(result).toEqual({ name: "pin-model-version", resolved: true });
  });

  it("resolves a prompt version's version label as its name", async () => {
    const { organizationId, adminId } = await makeFixture();
    await withTenantContext(testDb.appDb, organizationId, (tx) =>
      createPrompt(tx, { organizationId, userId: adminId }, { organizationId, name: "code-review-strict" }),
    );
    const version = await withTenantContext(testDb.appDb, organizationId, (tx) =>
      publishVersion(tx, { organizationId, userId: adminId }, {
        organizationId,
        promptName: "code-review-strict",
        version: "v3",
        systemTemplate: null,
        userTemplate: null,
        inputSchema: {},
        tags: [],
      }),
    );

    const result = await withTenantContext(testDb.appDb, organizationId, (tx) =>
      resolveResourceDisplayName(tx, organizationId, adminId, "prompt_version", version.id),
    );

    expect(result).toEqual({ name: "v3", resolved: true });
  });

  it("falls back to the raw id for project_member (no id-based finder exists)", async () => {
    const { organizationId, teamId, adminId, otherUserId } = await makeFixture();
    const project = await withTenantContext(testDb.appDb, organizationId, (tx) =>
      createProject(
        tx,
        { organizationId, userId: adminId },
        { organizationId, teamId, name: `proj-${randomUUID()}`, slug: `slug-${randomUUID()}` },
        {
          organizationExists: async () => true,
          teamBelongsToOrganization: async () => true,
          userBelongsToOrganization: async () => true,
        },
      ),
    );
    const member = await withTenantContext(testDb.appDb, organizationId, (tx) =>
      addProjectMember(
        tx,
        { organizationId, userId: adminId },
        { projectId: project.id, userId: otherUserId },
        {
          organizationExists: async () => true,
          teamBelongsToOrganization: async () => true,
          userBelongsToOrganization: async () => true,
        },
      ),
    );

    const result = await withTenantContext(testDb.appDb, organizationId, (tx) =>
      resolveResourceDisplayName(tx, organizationId, adminId, "project_member", member.id),
    );

    expect(result).toEqual({ name: member.id, resolved: false });
  });

  it("falls back to the raw id when the resource has since been deleted", async () => {
    const { organizationId, adminId } = await makeFixture();
    const deletedTeamId = randomUUID();

    const result = await withTenantContext(testDb.appDb, organizationId, (tx) =>
      resolveResourceDisplayName(tx, organizationId, adminId, "team", deletedTeamId),
    );

    expect(result).toEqual({ name: deletedTeamId, resolved: false });
  });

  it("falls back to a '—' placeholder for a null resourceId (e.g. a system event)", async () => {
    const { organizationId, adminId } = await makeFixture();

    const result = await withTenantContext(testDb.appDb, organizationId, (tx) =>
      resolveResourceDisplayName(tx, organizationId, adminId, "user", null),
    );

    expect(result).toEqual({ name: "—", resolved: false });
  });
});
