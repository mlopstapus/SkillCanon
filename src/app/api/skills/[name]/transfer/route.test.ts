import { randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createUser } from "@/bcs/identity-access";
import { createPrompt } from "@/bcs/prompt-registry";
import { withTenantContext } from "@/shared/db";
import { startTestDb, type TestDb } from "@/shared/db/test-helpers";
import { withApiRoute } from "@/shared/api/handler";
import { loginAndBuildCookie, seedOrgWithAdmin, type SeededOrg } from "@/shared/api/test-helpers";
import { handlePost } from "./route";

describe("/api/skills/[name]/transfer", () => {
  let testDb: TestDb;

  beforeAll(async () => {
    testDb = await startTestDb();
  }, 120_000);

  afterAll(async () => {
    await testDb.teardown();
  });

  beforeEach(() => {
    vi.stubEnv("STRIPE_ENABLED", "true");
    vi.stubEnv("JWT_SECRET", "a-real-signing-secret-for-tests");
    vi.stubEnv("JWT_EXPIRY_HOURS", "24");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  function route() {
    return {
      POST: withApiRoute(handlePost, { authDb: testDb.authDb, db: testDb.appDb }),
    };
  }

  async function seedSkill(seeded: SeededOrg, name: string) {
    return withTenantContext(testDb.appDb, seeded.organizationId, (tx) =>
      createPrompt(tx, { organizationId: seeded.organizationId, userId: seeded.adminUserId }, {
        organizationId: seeded.organizationId,
        name,
      }),
    );
  }

  async function seedMember(seeded: SeededOrg) {
    const suffix = randomUUID();
    const email = `member-${suffix}@example.com`;
    const password = "correct-horse-battery-staple";
    const created = await withTenantContext(testDb.appDb, seeded.organizationId, (tx) =>
      createUser(tx, {
        id: seeded.adminUserId,
        orgId: seeded.organizationId,
        teamId: seeded.teamId,
        role: "admin",
        email: seeded.adminEmail,
      }, {
        teamId: seeded.teamId,
        username: `member-${suffix}`,
        email,
        password,
        role: "member",
      }),
    );
    return { userId: created.id, email, password };
  }

  async function postTransfer(name: string, cookie: string, body: unknown) {
    const { POST } = route();
    return POST(
      new Request(`http://x/api/skills/${name}/transfer`, {
        method: "POST",
        headers: { cookie, "content-type": "application/json" },
        body: JSON.stringify(body),
      }),
      { params: Promise.resolve({ name }) },
    );
  }

  it("transfers a skill to an in-organization user and returns its updated owner", async () => {
    const seeded = await seedOrgWithAdmin(testDb.authDb);
    const name = `transfer-me-${randomUUID()}`;
    await seedSkill(seeded, name);
    const member = await seedMember(seeded);
    const cookie = await loginAndBuildCookie(testDb.authDb, seeded.adminEmail, seeded.adminPassword);

    const response = await postTransfer(name, cookie, {
      newOwnerType: "user",
      newOwnerId: member.userId,
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ ownerType: "user", ownerId: member.userId });
  });

  it("returns 404 SKILL_NOT_FOUND for an unknown skill name", async () => {
    const seeded = await seedOrgWithAdmin(testDb.authDb);
    const name = `missing-${randomUUID()}`;
    const cookie = await loginAndBuildCookie(testDb.authDb, seeded.adminEmail, seeded.adminPassword);

    const response = await postTransfer(name, cookie, {
      newOwnerType: "user",
      newOwnerId: seeded.adminUserId,
    });

    expect(response.status).toBe(404);
    expect((await response.json()).error.code).toBe("SKILL_NOT_FOUND");
  });

  it("returns 404 CROSS_ORG_TRANSFER for a destination in another organization", async () => {
    const seeded = await seedOrgWithAdmin(testDb.authDb);
    const otherOrg = await seedOrgWithAdmin(testDb.authDb);
    const name = `cross-org-${randomUUID()}`;
    await seedSkill(seeded, name);
    const cookie = await loginAndBuildCookie(testDb.authDb, seeded.adminEmail, seeded.adminPassword);

    const response = await postTransfer(name, cookie, {
      newOwnerType: "user",
      newOwnerId: otherOrg.adminUserId,
    });

    expect(response.status).toBe(404);
    expect((await response.json()).error.code).toBe("CROSS_ORG_TRANSFER");
  });

  it("returns 403 before revealing that an unauthorized caller's destination is cross-organization", async () => {
    const seeded = await seedOrgWithAdmin(testDb.authDb);
    const otherOrg = await seedOrgWithAdmin(testDb.authDb);
    const name = `unauthorized-cross-org-${randomUUID()}`;
    await seedSkill(seeded, name);
    const member = await seedMember(seeded);
    const cookie = await loginAndBuildCookie(testDb.authDb, member.email, member.password);

    const response = await postTransfer(name, cookie, {
      newOwnerType: "user",
      newOwnerId: otherOrg.adminUserId,
    });

    expect(response.status).toBe(403);
    expect((await response.json()).error.code).toBe("SUBSCRIBER_NOT_AUTHORIZED");
  });

  it("returns 422 CANNOT_TRANSFER_TO_SAME_OWNER for the current owner", async () => {
    const seeded = await seedOrgWithAdmin(testDb.authDb);
    const name = `same-owner-${randomUUID()}`;
    await seedSkill(seeded, name);
    const cookie = await loginAndBuildCookie(testDb.authDb, seeded.adminEmail, seeded.adminPassword);

    const response = await postTransfer(name, cookie, {
      newOwnerType: "user",
      newOwnerId: seeded.adminUserId,
    });

    expect(response.status).toBe(422);
    expect((await response.json()).error.code).toBe("CANNOT_TRANSFER_TO_SAME_OWNER");
  });

  it("returns 403 SUBSCRIBER_NOT_AUTHORIZED when a non-owner transfers another user's skill", async () => {
    const seeded = await seedOrgWithAdmin(testDb.authDb);
    const name = `unauthorized-${randomUUID()}`;
    await seedSkill(seeded, name);
    const member = await seedMember(seeded);
    const cookie = await loginAndBuildCookie(testDb.authDb, member.email, member.password);

    const response = await postTransfer(name, cookie, {
      newOwnerType: "user",
      newOwnerId: member.userId,
    });

    expect(response.status).toBe(403);
    expect((await response.json()).error.code).toBe("SUBSCRIBER_NOT_AUTHORIZED");
  });

  it("returns 422 VALIDATION_FAILED for a malformed transfer body", async () => {
    const seeded = await seedOrgWithAdmin(testDb.authDb);
    const name = `malformed-${randomUUID()}`;
    await seedSkill(seeded, name);
    const cookie = await loginAndBuildCookie(testDb.authDb, seeded.adminEmail, seeded.adminPassword);

    const response = await postTransfer(name, cookie, { newOwnerType: "user" });

    expect(response.status).toBe(422);
    expect((await response.json()).error.code).toBe("VALIDATION_FAILED");
  });
});
