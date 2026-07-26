import { randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { startTestDb, type TestDb } from "@/shared/db/test-helpers";
import { withTenantContext } from "@/shared/db/tenant-context";
import { createOrganization } from "./create-organization";
import { createTeam } from "./create-team";
import { insertTeamBetween } from "./insert-team-between";
import { teams } from "../infrastructure/schema";
import { eq, sql } from "drizzle-orm";

describe("insertTeamBetween", () => {
  let testDb: TestDb;

  beforeAll(async () => {
    testDb = await startTestDb();
  }, 120_000);

  beforeEach(() => {
    vi.stubEnv("STRIPE_ENABLED", "true");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  afterAll(async () => {
    await testDb.teardown();
  });

  async function makeOrg(name: string) {
    return testDb.authDb.transaction((tx) =>
      createOrganization(tx, { name, slug: `${name}-${randomUUID()}` }),
    );
  }

  it("splices a new team into an existing parent-child link", async () => {
    const org = await makeOrg("org-splice");
    const grandparent = await withTenantContext(testDb.appDb, org.id, (tx) =>
      createTeam(tx, { organizationId: org.id, name: "Engineering", slug: "engineering" }),
    );
    const child = await withTenantContext(testDb.appDb, org.id, (tx) =>
      createTeam(tx, {
        organizationId: org.id,
        name: "Platform",
        slug: "platform",
        parentTeamId: grandparent.id,
      }),
    );

    const inserted = await withTenantContext(testDb.appDb, org.id, (tx) =>
      insertTeamBetween(
        tx,
        { organizationId: org.id, name: "Backend", slug: "backend" },
        child.id,
      ),
    );

    const [newRow, childRow] = await withTenantContext(testDb.appDb, org.id, async (tx) => {
      const [n] = await tx.select().from(teams).where(eq(teams.id, inserted.id));
      const [c] = await tx.select().from(teams).where(eq(teams.id, child.id));
      return [n, c];
    });
    expect(newRow?.parentTeamId).toBe(grandparent.id);
    expect(childRow?.parentTeamId).toBe(inserted.id);
  });

  it("when the child is root-level, the new team becomes the new root", async () => {
    const org = await makeOrg("org-splice-root");
    const child = await withTenantContext(testDb.appDb, org.id, (tx) =>
      createTeam(tx, { organizationId: org.id, name: "Root Team", slug: "root-team" }),
    );

    const inserted = await withTenantContext(testDb.appDb, org.id, (tx) =>
      insertTeamBetween(
        tx,
        { organizationId: org.id, name: "New Root", slug: "new-root" },
        child.id,
      ),
    );

    const [newRow, childRow] = await withTenantContext(testDb.appDb, org.id, async (tx) => {
      const [n] = await tx.select().from(teams).where(eq(teams.id, inserted.id));
      const [c] = await tx.select().from(teams).where(eq(teams.id, child.id));
      return [n, c];
    });
    expect(newRow?.parentTeamId).toBeNull();
    expect(childRow?.parentTeamId).toBe(inserted.id);
  });

  it("rejects a nonexistent child team, no team created", async () => {
    const org = await makeOrg("org-splice-missing");
    const uniqueSlug = `backend-${randomUUID()}`;

    await expect(
      withTenantContext(testDb.appDb, org.id, (tx) =>
        insertTeamBetween(
          tx,
          { organizationId: org.id, name: "Backend", slug: uniqueSlug },
          randomUUID(),
        ),
      ),
    ).rejects.toThrow();

    const rows = await withTenantContext(testDb.appDb, org.id, (tx) =>
      tx.select().from(teams).where(eq(teams.slug, uniqueSlug)),
    );
    expect(rows).toHaveLength(0);
  });

  it("leaves every other team in a larger hierarchy unaffected", async () => {
    const org = await makeOrg("org-splice-isolated");
    const root = await withTenantContext(testDb.appDb, org.id, (tx) =>
      createTeam(tx, { organizationId: org.id, name: "Root", slug: "root" }),
    );
    const sibling = await withTenantContext(testDb.appDb, org.id, (tx) =>
      createTeam(tx, {
        organizationId: org.id,
        name: "Sibling",
        slug: "sibling",
        parentTeamId: root.id,
      }),
    );
    const child = await withTenantContext(testDb.appDb, org.id, (tx) =>
      createTeam(tx, {
        organizationId: org.id,
        name: "Child",
        slug: "child",
        parentTeamId: root.id,
      }),
    );

    await withTenantContext(testDb.appDb, org.id, (tx) =>
      insertTeamBetween(
        tx,
        { organizationId: org.id, name: "Middle", slug: "middle" },
        child.id,
      ),
    );

    const [siblingRow, rootRow] = await withTenantContext(testDb.appDb, org.id, async (tx) => {
      const [s] = await tx.select().from(teams).where(eq(teams.id, sibling.id));
      const [r] = await tx.select().from(teams).where(eq(teams.id, root.id));
      return [s, r];
    });
    expect(siblingRow?.parentTeamId).toBe(root.id);
    expect(rootRow?.parentTeamId).toBeNull();
  });

  it("records exactly one operation-level team.reparented audit event", async () => {
    const org = await makeOrg("org-audited-splice");
    const child = await withTenantContext(testDb.appDb, org.id, (tx) =>
      createTeam(tx, { organizationId: org.id, name: "Child", slug: "audited-child" }),
    );

    const inserted = await withTenantContext(testDb.appDb, org.id, (tx) =>
      insertTeamBetween(
        tx,
        { organizationId: org.id, name: "Middle", slug: "audited-middle" },
        child.id,
        { auditContext: { transport: "cli", sourceIp: null } },
      ),
    );

    const rows = await testDb.appDb.execute<{
      action: string;
      resource_id: string | null;
      transport: string;
      source_ip: string | null;
    }>(
      sql`select action, resource_id, transport, source_ip from audit.audit_events where resource_id = ${inserted.id}`,
    );

    expect(Array.from(rows)).toEqual([
      {
        action: "team.reparented",
        resource_id: inserted.id,
        transport: "cli",
        source_ip: null,
      },
    ]);
  });

});
