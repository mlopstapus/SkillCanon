import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { withTenantContext } from "@/shared/db/tenant-context";
import { startTestDb, type TestDb } from "@/shared/db/test-helpers";
import { assertCrossTenantDenied } from "@/shared/testing/tenant-isolation";
import { recordPromptUsage } from "./record-prompt-usage";

/**
 * `distribution.prompt_usage` (030-distribution-tenant-isolation), proving
 * denial via the shared helper (contracts/distribution-tenant-isolation.md,
 * FR-009/FR-010):
 *   1. through a raw, deliberately-unfiltered query, relying on RLS alone (M2)
 *   2. through the real `recordPromptUsage()` insert path, whose
 *      `organizationId` is caller-supplied rather than session-derived
 * This table is immutable, append-only, and has no application-layer
 * read-by-id, update, or delete path (aggregate-only reads — see
 * research.md) — unlike every other tenant-isolation feature's resource
 * types, its coverage is RLS-alone read/write denial plus the insert case,
 * not an app-layer by-id accessor.
 */
describe("distribution tenant isolation (030-distribution-tenant-isolation)", () => {
  let testDb: TestDb;

  beforeAll(async () => {
    testDb = await startTestDb();
  }, 120_000);

  afterAll(async () => {
    await testDb.teardown();
  });

  describe("prompt_usage", () => {
    it("denies cross-organization read/write access by id via RLS alone", async () => {
      const orgA = randomUUID();
      const orgB = randomUUID();
      const promptId = randomUUID();
      const promptVersionId = randomUUID();

      await withTenantContext(testDb.appDb, orgB, (tx) =>
        recordPromptUsage(tx, { organizationId: orgB, promptId, promptVersionId }),
      );

      const [row] = await withTenantContext(testDb.appDb, orgB, (tx) =>
        tx.execute(sql`select id from distribution.prompt_usage where organization_id = ${orgB}`),
      );
      const usageId = (row as { id: string }).id;

      await assertCrossTenantDenied({
        actingAsOrg: orgA,
        resourceOwnedByOrg: orgB,
        resourceId: usageId,
        fetchResourceById: (id) =>
          withTenantContext(testDb.appDb, orgA, async (tx) =>
            Array.from(await tx.execute(sql`select id from distribution.prompt_usage where id = ${id}`)),
          ),
      });

      await assertCrossTenantDenied({
        actingAsOrg: orgA,
        resourceOwnedByOrg: orgB,
        resourceId: usageId,
        fetchResourceById: (id) =>
          withTenantContext(testDb.appDb, orgA, async (tx) =>
            Array.from(
              await tx.execute(sql`
                update distribution.prompt_usage
                set status_code = 999
                where id = ${id}
                returning id
              `),
            ),
          ),
      });

      await assertCrossTenantDenied({
        actingAsOrg: orgA,
        resourceOwnedByOrg: orgB,
        resourceId: usageId,
        fetchResourceById: (id) =>
          withTenantContext(testDb.appDb, orgA, async (tx) =>
            Array.from(
              await tx.execute(sql`
                delete from distribution.prompt_usage
                where id = ${id}
                returning id
              `),
            ),
          ),
      });
    });

    it("denies an insert claiming a different organization than the session's tenant context", async () => {
      const orgA = randomUUID();
      const orgB = randomUUID();

      await expect(
        withTenantContext(testDb.appDb, orgA, (tx) =>
          recordPromptUsage(tx, {
            organizationId: orgB,
            promptId: randomUUID(),
            promptVersionId: randomUUID(),
          }),
        ),
      ).rejects.toThrow();

      const rowsUnderOrgB = await withTenantContext(testDb.appDb, orgB, (tx) =>
        tx.execute(sql`select id from distribution.prompt_usage where organization_id = ${orgB}`),
      );
      expect(Array.from(rowsUnderOrgB)).toEqual([]);
    });
  });
});
