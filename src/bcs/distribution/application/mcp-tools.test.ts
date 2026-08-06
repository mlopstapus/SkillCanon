import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createObjective, createPolicy, type ObjectiveScopeVerifier, type PolicyScopeVerifier } from "@/bcs/governance";
import { createPrompt, publishVersion, type PromptActor } from "@/bcs/prompt-registry";
import { getTeam, type UserSummary } from "@/bcs/identity-access";
import { withTenantContext } from "@/shared/db";
import { seedOrgWithAdmin, type SeededOrg } from "@/shared/api/test-helpers";
import { startTestDb, type TestDb } from "@/shared/db/test-helpers";
import { McpSessionManager, type McpCaller } from "./mcp-session";
import { createSyntheticSessionId, shContext, shList, shRun, shSearch, shWorkflowList, shWorkflowRun, type McpToolContext } from "./mcp-tools";

describe("MCP tool behavior", () => {
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

  function callerFor(seeded: SeededOrg): McpCaller {
    const user: UserSummary = {
      id: seeded.adminUserId,
      orgId: seeded.organizationId,
      teamId: seeded.teamId,
      role: "admin",
      email: seeded.adminEmail,
    };
    return { user, scopes: ["prompts:read", "prompts:write", "workflows:run"] };
  }

  function ctxFor(seeded: SeededOrg, overrides: Partial<McpToolContext> = {}): McpToolContext {
    return {
      db: testDb.appDb,
      caller: callerFor(seeded),
      sessionId: createSyntheticSessionId(),
      auditContext: { transport: "api", sourceIp: null },
      sessionManager: new McpSessionManager(),
      ...overrides,
    };
  }

  async function publishTemplateSkill(seeded: SeededOrg, name: string, userTemplate = "Hello.") {
    const actor: PromptActor = { organizationId: seeded.organizationId, userId: seeded.adminUserId };
    return withTenantContext(testDb.appDb, seeded.organizationId, async (tx) => {
      await createPrompt(tx, actor, { organizationId: seeded.organizationId, name });
      return publishVersion(tx, actor, {
        organizationId: seeded.organizationId,
        promptName: name,
        version: "1.0.0",
        systemTemplate: "You are helpful.",
        userTemplate,
      });
    });
  }

  it("shList lists a registered prompt", async () => {
    const seeded = await seedOrgWithAdmin(testDb.authDb);
    const name = `alpha-${randomUUID()}`;
    await publishTemplateSkill(seeded, name);

    const result = await shList(ctxFor(seeded));

    expect(result).toContain(name);
  });

  it("shSearch matches a prompt by name and omits a non-matching one", async () => {
    const seeded = await seedOrgWithAdmin(testDb.authDb);
    const matchName = `commit-helper-${randomUUID()}`;
    const otherName = `unrelated-${randomUUID()}`;
    await publishTemplateSkill(seeded, matchName);
    await publishTemplateSkill(seeded, otherName);

    const result = await shSearch({ query: "commit-helper" }, ctxFor(seeded));

    expect(result).toContain(matchName);
    expect(result).not.toContain(otherName);
  });

  it("shContext shows a team-scoped policy and objective for the caller", async () => {
    const seeded = await seedOrgWithAdmin(testDb.authDb);
    const policyName = `require-typed-errors-${randomUUID()}`;
    const objectiveTitle = `reduce-cost-${randomUUID()}`;
    const actor = { organizationId: seeded.organizationId, userId: seeded.adminUserId };

    await withTenantContext(testDb.appDb, seeded.organizationId, (tx) => {
      const verifier = {
        teamBelongsToOrganization: async (orgId: string, teamId: string) => {
          try {
            await getTeam(tx, orgId, teamId);
            return true;
          } catch {
            return false;
          }
        },
      } satisfies PolicyScopeVerifier & ObjectiveScopeVerifier;
      return createPolicy(
        tx,
        actor,
        { teamId: seeded.teamId, name: policyName, enforcementType: "append", priority: 10, content: "Use typed errors." },
        verifier,
      );
    });
    await withTenantContext(testDb.appDb, seeded.organizationId, (tx) => {
      const verifier = {
        teamBelongsToOrganization: async (orgId: string, teamId: string) => {
          try {
            await getTeam(tx, orgId, teamId);
            return true;
          } catch {
            return false;
          }
        },
      } satisfies ObjectiveScopeVerifier;
      return createObjective(tx, actor, { teamId: seeded.teamId, title: objectiveTitle }, verifier);
    });

    const result = await shContext({}, ctxFor(seeded));

    expect(result).toContain(policyName);
    expect(result).toContain(objectiveTitle);
  });

  it("shContext rejects a malformed project_id without throwing", async () => {
    const seeded = await seedOrgWithAdmin(testDb.authDb);

    const result = await shContext({ project_id: "not-a-uuid" }, ctxFor(seeded));

    expect(result).toContain("invalid project_id");
  });

  it("shRun expands a prompt and records exactly one prompt.expanded audit event", async () => {
    const seeded = await seedOrgWithAdmin(testDb.authDb);
    const name = `release-notes-${randomUUID()}`;
    const version = await publishTemplateSkill(seeded, name, "Summarize: {{ input }}");

    const result = await shRun({ name, input: "Ship the thing" }, ctxFor(seeded));

    expect(result).toContain("Ship the thing");

    const rows = Array.from(
      await testDb.ownerDb.execute<{ resource_id: string; actor_user_id: string }>(
        sql`select resource_id, actor_user_id from audit.audit_events where organization_id = ${seeded.organizationId} and action = 'prompt.expanded'`,
      ),
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ resource_id: version.promptId, actor_user_id: seeded.adminUserId });
  });

  it("shRun reports a clear error for a prompt the caller cannot see, without recording an audit event", async () => {
    const seeded = await seedOrgWithAdmin(testDb.authDb);

    const result = await shRun({ name: "does-not-exist", input: "anything" }, ctxFor(seeded));

    expect(result).toContain("not found");
    const rows = Array.from(
      await testDb.ownerDb.execute(
        sql`select 1 from audit.audit_events where organization_id = ${seeded.organizationId} and action = 'prompt.expanded'`,
      ),
    );
    expect(rows).toHaveLength(0);
  });

  it("shWorkflowList lists a chain-kind skill and omits a plain template skill", async () => {
    const seeded = await seedOrgWithAdmin(testDb.authDb);
    const stepName = `step-${randomUUID()}`;
    await publishTemplateSkill(seeded, stepName, "Step body.");
    const templateOnlyName = `not-a-workflow-${randomUUID()}`;
    await publishTemplateSkill(seeded, templateOnlyName);
    const workflowName = `workflow-${randomUUID()}`;
    const actor: PromptActor = { organizationId: seeded.organizationId, userId: seeded.adminUserId };
    await withTenantContext(testDb.appDb, seeded.organizationId, async (tx) => {
      await createPrompt(tx, actor, { organizationId: seeded.organizationId, name: workflowName });
      await publishVersion(tx, actor, {
        organizationId: seeded.organizationId,
        promptName: workflowName,
        version: "1.0.0",
        steps: [{ id: "step1", promptName: stepName, dependsOn: [] }],
      });
    });

    const result = await shWorkflowList(ctxFor(seeded));

    expect(result).toContain(workflowName);
    expect(result).not.toContain(templateOnlyName);
  });

  it("shWorkflowRun starts a real chain run and returns the pending step", async () => {
    const seeded = await seedOrgWithAdmin(testDb.authDb);
    const stepName = `step-${randomUUID()}`;
    await publishTemplateSkill(seeded, stepName, "Step body, no template variables.");
    const workflowName = `workflow-${randomUUID()}`;
    const actor: PromptActor = { organizationId: seeded.organizationId, userId: seeded.adminUserId };
    await withTenantContext(testDb.appDb, seeded.organizationId, async (tx) => {
      await createPrompt(tx, actor, { organizationId: seeded.organizationId, name: workflowName });
      await publishVersion(tx, actor, {
        organizationId: seeded.organizationId,
        promptName: workflowName,
        version: "1.0.0",
        steps: [{ id: "step1", promptName: stepName, dependsOn: [] }],
      });
    });

    const result = await shWorkflowRun({ name: workflowName, input: "go" }, ctxFor(seeded));

    expect(result).toContain(workflowName);
    expect(result).toContain("runId");
    expect(result).toContain("step1");
  });

  it("injects the session-context block only on the first tool call in a session, not the second", async () => {
    const seeded = await seedOrgWithAdmin(testDb.authDb);
    await publishTemplateSkill(seeded, `alpha-${randomUUID()}`);
    const sessionManager = new McpSessionManager();
    const sessionId = createSyntheticSessionId();
    const ctx = ctxFor(seeded, { sessionId, sessionManager });

    const first = await shList(ctx);
    const second = await shList(ctx);

    expect(first).toContain("SESSION CONTEXT");
    expect(second).not.toContain("SESSION CONTEXT");
  });
});
