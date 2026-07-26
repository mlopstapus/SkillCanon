import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { startTestDb, type TestDb } from "@/shared/db/test-helpers";
import { createOrganization } from "./create-organization";
import { SecondOrganizationNotAllowedError } from "../domain/organization";
import { organizations } from "../infrastructure/schema";

describe("createOrganization", () => {
  let testDb: TestDb;

  beforeAll(async () => {
    testDb = await startTestDb();
  }, 120_000);

  // Every test in this file assumes it starts from zero organizations
  // (self-hosted mode's guard, and the slug-uniqueness tests, both depend on
  // a known starting count).
  beforeEach(async () => {
    await testDb.ownerDb.delete(organizations);
  });

  afterAll(async () => {
    await testDb.teardown();
  });

  it("inserts one organization row when none exist", async () => {
    const result = await testDb.authDb.transaction((tx) =>
      createOrganization(tx, { name: "Acme", slug: `acme-${randomUUID()}` }),
    );

    expect(result.id).toBeTruthy();
    const rows = await testDb.authDb
      .select()
      .from(organizations)
      .where(sql`${organizations.id} = ${result.id}`);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.name).toBe("Acme");
  });

  it("rejects a second organization in self-hosted mode, writing no row", async () => {
    await testDb.authDb.transaction((tx) =>
      createOrganization(tx, { name: "First", slug: `first-${randomUUID()}` }),
    );

    await expect(
      testDb.authDb.transaction((tx) =>
        createOrganization(tx, { name: "Second", slug: `second-${randomUUID()}` }),
      ),
    ).rejects.toThrow(SecondOrganizationNotAllowedError);

    const rows = await testDb.authDb.select().from(organizations);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.name).toBe("First");
  });

  it("under two concurrent attempts against an empty self-hosted DB, exactly one succeeds", async () => {
    const attempt = (name: string) =>
      testDb.authDb.transaction((tx) =>
        createOrganization(tx, { name, slug: `${name}-${randomUUID()}` }),
      );

    const results = await Promise.allSettled([attempt("Racer A"), attempt("Racer B")]);

    const fulfilled = results.filter((r) => r.status === "fulfilled");
    const rejected = results.filter((r) => r.status === "rejected");
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect((rejected[0] as PromiseRejectedResult).reason).toBeInstanceOf(
      SecondOrganizationNotAllowedError,
    );

    const rows = await testDb.authDb.select().from(organizations);
    expect(rows).toHaveLength(1);
  });

  // Slug uniqueness is only reachable as a *distinct* failure mode in SaaS
  // mode — under self-hosted mode's default, a second creation attempt (of
  // any slug) is already rejected by the single-org guard tested above, so
  // these tests stub STRIPE_ENABLED=true to isolate the slug constraint.
  describe("slug uniqueness (SaaS mode, multiple organizations allowed)", () => {
    beforeEach(() => {
      vi.stubEnv("STRIPE_ENABLED", "true");
    });

    afterEach(() => {
      vi.unstubAllEnvs();
    });

    it("rejects a duplicate slug", async () => {
      const slug = `dup-${randomUUID()}`;
      await testDb.authDb.transaction((tx) =>
        createOrganization(tx, { name: "Original", slug }),
      );

      await expect(
        testDb.authDb.transaction((tx) =>
          createOrganization(tx, { name: "Impostor", slug }),
        ),
      ).rejects.toThrow(/already exists/);

      const rows = await testDb.authDb
        .select()
        .from(organizations)
        .where(sql`${organizations.slug} = ${slug}`);
      expect(rows).toHaveLength(1);
      expect(rows[0]?.name).toBe("Original");
    });

    it("under two concurrent attempts with the same slug, exactly one succeeds", async () => {
      const slug = `race-slug-${randomUUID()}`;
      const attempt = (name: string) =>
        testDb.authDb.transaction((tx) => createOrganization(tx, { name, slug }));

      const results = await Promise.allSettled([
        attempt("Racer A"),
        attempt("Racer B"),
      ]);

      const fulfilled = results.filter((r) => r.status === "fulfilled");
      const rejected = results.filter((r) => r.status === "rejected");
      expect(fulfilled).toHaveLength(1);
      expect(rejected).toHaveLength(1);

      const rows = await testDb.authDb
        .select()
        .from(organizations)
        .where(sql`${organizations.slug} = ${slug}`);
      expect(rows).toHaveLength(1);
    });
  });

  it("records exactly one organization.created audit event on success", async () => {
    const result = await testDb.authDb.transaction((tx) =>
      createOrganization(
        tx,
        { name: "Audited", slug: `audited-${randomUUID()}` },
        { auditContext: { transport: "cli", sourceIp: null } },
      ),
    );

    const rows = await testDb.appDb.execute<{
      action: string;
      resource_id: string | null;
      transport: string;
      source_ip: string | null;
    }>(
      sql`select action, resource_id, transport, source_ip from audit.audit_events where resource_id = ${result.id}`,
    );

    expect(Array.from(rows)).toEqual([
      {
        action: "organization.created",
        resource_id: result.id,
        transport: "cli",
        source_ip: null,
      },
    ]);
  });

});
