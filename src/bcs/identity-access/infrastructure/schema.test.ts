import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { startTestDb, type TestDb } from "@/shared/db/test-helpers";

describe("organizations schema (real migration)", () => {
  let testDb: TestDb;

  beforeAll(async () => {
    testDb = await startTestDb();
  }, 120_000);

  afterAll(async () => {
    await testDb.teardown();
  });

  it("has a real unique constraint on slug (FR-002)", async () => {
    const rows = await testDb.ownerDb.execute<{ constraint_type: string }>(
      sql`select tc.constraint_type
          from information_schema.table_constraints tc
          join information_schema.constraint_column_usage ccu
            on tc.constraint_name = ccu.constraint_name
           and tc.table_schema = ccu.table_schema
          where tc.table_schema = 'identity_access'
            and tc.table_name = 'organizations'
            and ccu.column_name = 'slug'
            and tc.constraint_type = 'UNIQUE'`,
    );
    expect(rows).toHaveLength(1);
  });

  it("carries no organization_id column — it is the tenant root, not a tenant-scoped table", async () => {
    const rows = await testDb.ownerDb.execute<{ column_name: string }>(
      sql`select column_name from information_schema.columns
          where table_schema = 'identity_access' and table_name = 'organizations'`,
    );
    const names = rows.map((r) => r.column_name);
    expect(names).not.toContain("organization_id");
    expect(names).toEqual(
      expect.arrayContaining([
        "id",
        "name",
        "slug",
        "plan_id",
        "stripe_customer_id",
        "created_at",
        "updated_at",
      ]),
    );
  });
});

describe("invitations schema (real migration)", () => {
  let testDb: TestDb;

  beforeAll(async () => {
    testDb = await startTestDb();
  }, 120_000);

  afterAll(async () => {
    await testDb.teardown();
  });

  it("has a real unique constraint on token", async () => {
    const rows = await testDb.ownerDb.execute<{ constraint_type: string }>(
      sql`select tc.constraint_type
          from information_schema.table_constraints tc
          join information_schema.constraint_column_usage ccu
            on tc.constraint_name = ccu.constraint_name
           and tc.table_schema = ccu.table_schema
          where tc.table_schema = 'identity_access'
            and tc.table_name = 'invitations'
            and ccu.column_name = 'token'
            and tc.constraint_type = 'UNIQUE'`,
    );
    expect(rows).toHaveLength(1);
  });

  it("has foreign keys on team_id and invited_by_id", async () => {
    // key_column_usage reports the *local* (referencing) column for a FK,
    // unlike constraint_column_usage which reports the referenced column.
    const rows = await testDb.ownerDb.execute<{ column_name: string }>(
      sql`select kcu.column_name
          from information_schema.table_constraints tc
          join information_schema.key_column_usage kcu
            on tc.constraint_name = kcu.constraint_name
           and tc.table_schema = kcu.table_schema
          where tc.table_schema = 'identity_access'
            and tc.table_name = 'invitations'
            and tc.constraint_type = 'FOREIGN KEY'`,
    );
    expect(rows.map((r) => r.column_name).sort()).toEqual(
      ["invited_by_id", "team_id"].sort(),
    );
  });

  it("has a not-null organization_id with no foreign key, matching every other organization_id column in this schema", async () => {
    const columnRows = await testDb.ownerDb.execute<{
      column_name: string;
      is_nullable: string;
    }>(
      sql`select column_name, is_nullable from information_schema.columns
          where table_schema = 'identity_access' and table_name = 'invitations'
            and column_name = 'organization_id'`,
    );
    expect(columnRows).toHaveLength(1);
    expect(columnRows[0]?.is_nullable).toBe("NO");

    const fkRows = await testDb.ownerDb.execute<{ column_name: string }>(
      sql`select kcu.column_name
          from information_schema.table_constraints tc
          join information_schema.key_column_usage kcu
            on tc.constraint_name = kcu.constraint_name
           and tc.table_schema = kcu.table_schema
          where tc.table_schema = 'identity_access'
            and tc.table_name = 'invitations'
            and tc.constraint_type = 'FOREIGN KEY'
            and kcu.column_name = 'organization_id'`,
    );
    expect(fkRows).toHaveLength(0);
  });
});

describe("api_keys schema (real migration)", () => {
  let testDb: TestDb;

  beforeAll(async () => {
    testDb = await startTestDb();
  }, 120_000);

  afterAll(async () => {
    await testDb.teardown();
  });

  it("has a real unique constraint on key_hash", async () => {
    const rows = await testDb.ownerDb.execute<{ constraint_type: string }>(
      sql`select tc.constraint_type
          from information_schema.table_constraints tc
          join information_schema.constraint_column_usage ccu
            on tc.constraint_name = ccu.constraint_name
           and tc.table_schema = ccu.table_schema
          where tc.table_schema = 'identity_access'
            and tc.table_name = 'api_keys'
            and ccu.column_name = 'key_hash'
            and tc.constraint_type = 'UNIQUE'`,
    );
    expect(rows).toHaveLength(1);
  });

  it("has a foreign key on user_id", async () => {
    const rows = await testDb.ownerDb.execute<{ column_name: string }>(
      sql`select kcu.column_name
          from information_schema.table_constraints tc
          join information_schema.key_column_usage kcu
            on tc.constraint_name = kcu.constraint_name
           and tc.table_schema = kcu.table_schema
          where tc.table_schema = 'identity_access'
            and tc.table_name = 'api_keys'
            and tc.constraint_type = 'FOREIGN KEY'`,
    );
    expect(rows.map((r) => r.column_name)).toEqual(["user_id"]);
  });

  it("has a not-null organization_id with no foreign key, matching every other organization_id column in this schema", async () => {
    const columnRows = await testDb.ownerDb.execute<{
      column_name: string;
      is_nullable: string;
    }>(
      sql`select column_name, is_nullable from information_schema.columns
          where table_schema = 'identity_access' and table_name = 'api_keys'
            and column_name = 'organization_id'`,
    );
    expect(columnRows).toHaveLength(1);
    expect(columnRows[0]?.is_nullable).toBe("NO");

    const fkRows = await testDb.ownerDb.execute<{ column_name: string }>(
      sql`select kcu.column_name
          from information_schema.table_constraints tc
          join information_schema.key_column_usage kcu
            on tc.constraint_name = kcu.constraint_name
           and tc.table_schema = kcu.table_schema
          where tc.table_schema = 'identity_access'
            and tc.table_name = 'api_keys'
            and tc.constraint_type = 'FOREIGN KEY'
            and kcu.column_name = 'organization_id'`,
    );
    expect(fkRows).toHaveLength(0);
  });
});

describe("users schema (real migration)", () => {
  let testDb: TestDb;

  beforeAll(async () => {
    testDb = await startTestDb();
  }, 120_000);

  afterAll(async () => {
    await testDb.teardown();
  });

  it("team_id is nullable — a user can be unassigned from every team (019-account-team-settings-ui)", async () => {
    const rows = await testDb.ownerDb.execute<{ is_nullable: string }>(
      sql`select is_nullable from information_schema.columns
          where table_schema = 'identity_access' and table_name = 'users'
            and column_name = 'team_id'`,
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]?.is_nullable).toBe("YES");
  });

  it("still has a foreign key on team_id, unaffected by the nullability change", async () => {
    const rows = await testDb.ownerDb.execute<{ column_name: string }>(
      sql`select kcu.column_name
          from information_schema.table_constraints tc
          join information_schema.key_column_usage kcu
            on tc.constraint_name = kcu.constraint_name
           and tc.table_schema = kcu.table_schema
          where tc.table_schema = 'identity_access'
            and tc.table_name = 'users'
            and tc.constraint_type = 'FOREIGN KEY'
            and kcu.column_name = 'team_id'`,
    );
    expect(rows).toHaveLength(1);
  });
});
