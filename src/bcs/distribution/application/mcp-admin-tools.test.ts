import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { seedOrgWithAdmin, type SeededOrg } from "@/shared/api/test-helpers";
import { startTestDb, type TestDb } from "@/shared/db/test-helpers";
import type { UserSummary } from "@/bcs/identity-access";
import { McpSessionManager } from "./mcp-session";
import { createSyntheticSessionId, invokeMcpTool, type McpToolContext, type McpToolName } from "./mcp-tools";

describe("MCP admin and metrics tools", () => {
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

  const ALL_SCOPES = ["governance:read", "governance:write", "metrics:read"];

  function ctxFor(seeded: SeededOrg, scopes = ALL_SCOPES, userId = seeded.adminUserId): McpToolContext {
    const user: UserSummary = {
      id: userId,
      orgId: seeded.organizationId,
      teamId: seeded.teamId,
      role: "admin",
      email: seeded.adminEmail,
    };
    return {
      db: testDb.appDb,
      caller: { user, scopes },
      sessionId: createSyntheticSessionId(),
      auditContext: { transport: "mcp", sourceIp: null },
      sessionManager: new McpSessionManager(),
    };
  }

  async function call(name: McpToolName, args: object, ctx: McpToolContext) {
    const result = await invokeMcpTool(name, args, ctx);
    const text = (result.content[0] as { text: string }).text;
    return { isError: result.isError === true, text };
  }

  it("creates, lists, updates and deletes a team policy, auditing each change with transport mcp", async () => {
    const seeded = await seedOrgWithAdmin(testDb.authDb);
    const ctx = ctxFor(seeded);
    const name = `be-kind-${randomUUID()}`;

    const created = await call(
      "sh-admin-policy-create",
      { team_id: seeded.teamId, name, enforcementType: "append", content: "Be kind." },
      ctx,
    );
    expect(created.isError).toBe(false);
    const policy = JSON.parse(created.text) as { id: string };

    const listed = await call("sh-admin-policy-list", { team_id: seeded.teamId }, ctx);
    expect(listed.text).toContain(name);

    const updated = await call("sh-admin-policy-update", { policy_id: policy.id, content: "Be very kind." }, ctx);
    expect(JSON.parse(updated.text).content).toBe("Be very kind.");

    expect((await call("sh-admin-policy-delete", { policy_id: policy.id }, ctx)).text).toBe("Policy deleted.");

    const rows = Array.from(
      await testDb.ownerDb.execute<{ transport: string }>(
        sql`select transport from audit.audit_events where organization_id = ${seeded.organizationId} and resource_id = ${policy.id}`,
      ),
    );
    expect(rows.length).toBeGreaterThanOrEqual(3);
    expect(rows.every((row) => row.transport === "mcp")).toBe(true);
  });

  it("creates, lists, updates and deletes a team objective", async () => {
    const seeded = await seedOrgWithAdmin(testDb.authDb);
    const ctx = ctxFor(seeded);
    const title = `reduce-cost-${randomUUID()}`;

    const created = await call("sh-admin-objective-create", { team_id: seeded.teamId, title }, ctx);
    expect(created.isError).toBe(false);
    const objective = JSON.parse(created.text) as { id: string };

    expect((await call("sh-admin-objective-list", { team_id: seeded.teamId }, ctx)).text).toContain(title);
    const updated = await call("sh-admin-objective-update", { objective_id: objective.id, title: `${title}-2` }, ctx);
    expect(JSON.parse(updated.text).title).toBe(`${title}-2`);
    expect((await call("sh-admin-objective-delete", { objective_id: objective.id }, ctx)).text).toBe("Objective deleted.");
  });

  it("refuses a key without the needed scope, with isError and no change", async () => {
    const seeded = await seedOrgWithAdmin(testDb.authDb);
    const readOnly = ctxFor(seeded, ["governance:read"]);

    const write = await call(
      "sh-admin-policy-create",
      { team_id: seeded.teamId, name: "x", enforcementType: "append", content: "y" },
      readOnly,
    );
    expect(write.isError).toBe(true);
    expect(write.text).toContain("governance:write");
    expect((await call("sh-admin-policy-list", { team_id: seeded.teamId }, readOnly)).isError).toBe(false);
    expect((await call("sh-metrics-summary", {}, readOnly)).isError).toBe(true);
  });

  it("refuses an unknown team, an unknown policy, a bad argument and an actor who is not a real user", async () => {
    const seeded = await seedOrgWithAdmin(testDb.authDb);
    const ctx = ctxFor(seeded);

    expect(
      (await call("sh-admin-policy-create", { team_id: randomUUID(), name: "x", enforcementType: "append", content: "y" }, ctx))
        .isError,
    ).toBe(true);
    expect((await call("sh-admin-policy-delete", { policy_id: randomUUID() }, ctx)).isError).toBe(true);
    expect((await call("sh-admin-policy-create", { team_id: seeded.teamId }, ctx)).isError).toBe(true);
    expect(
      (
        await call(
          "sh-admin-policy-create",
          { team_id: seeded.teamId, name: "x", enforcementType: "append", content: "y" },
          ctxFor(seeded, ALL_SCOPES, randomUUID()),
        )
      ).isError,
    ).toBe(true);
  });

  it("returns the org usage summary for the metrics tool", async () => {
    const seeded = await seedOrgWithAdmin(testDb.authDb);

    const result = await call("sh-metrics-summary", { from: "2026-01-01" }, ctxFor(seeded));

    expect(result.isError).toBe(false);
    expect(JSON.parse(result.text)).toMatchObject({ totalInvocations: 0 });
  });
});
