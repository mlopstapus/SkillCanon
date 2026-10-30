import { sql } from "drizzle-orm";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { isInstanceSetUp } from "@/bcs/identity-access";
import { startTestDb, type TestDb } from "@/shared/db/test-helpers";
import { registerInstance } from "./register-instance";

describe("registerInstance (018/002)", () => {
  let testDb: TestDb;

  beforeAll(async () => {
    testDb = await startTestDb();
  }, 120_000);

  afterAll(async () => {
    await testDb.teardown();
  });

  beforeEach(() => {
    // Even with the multi-org flag on, the register action must not create a second organization.
    vi.stubEnv("STRIPE_ENABLED", "true");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  const input = (suffix: string) => ({
    organization: { name: "Tribe", slug: `tribe-${suffix}` },
    team: { name: "Platform", slug: `platform-${suffix}` },
    admin: { username: `admin-${suffix}`, email: `admin-${suffix}@example.com`, password: "correct-horse-battery-staple" },
  });

  async function orgCount() {
    const rows = Array.from(await testDb.ownerDb.execute<{ n: string }>(sql`select count(*)::text as n from identity_access.organizations`));
    return Number(rows[0]?.n);
  }

  it("creates the organization on first run, then refuses every later attempt without creating one", async () => {
    expect(await isInstanceSetUp(testDb.authDb)).toBe(false);

    await registerInstance(testDb.authDb, input("one"));
    expect(await isInstanceSetUp(testDb.authDb)).toBe(true);
    expect(await orgCount()).toBe(1);

    await expect(registerInstance(testDb.authDb, input("two"))).rejects.toMatchObject({
      name: "SecondOrganizationNotAllowedError",
    });
    expect(await orgCount()).toBe(1);
  });
});
