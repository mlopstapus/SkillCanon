import { randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createUser } from "@/bcs/identity-access";
import { createPrompt } from "@/bcs/prompt-registry";
import { withTenantContext } from "@/shared/db";
import { startTestDb, type TestDb } from "@/shared/db/test-helpers";
import { withApiRoute } from "@/shared/api/handler";
import { loginAndBuildCookie, seedOrgWithAdmin, type SeededOrg } from "@/shared/api/test-helpers";
import { handlePost } from "./route";

describe("/api/skills/[name]/fork", () => {
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
    const deps = { authDb: testDb.authDb, db: testDb.appDb };
    return {
      POST: withApiRoute(handlePost, deps),
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
    const adminActingUser = {
      id: seeded.adminUserId,
      orgId: seeded.organizationId,
      teamId: seeded.teamId,
      role: "admin" as const,
      email: seeded.adminEmail,
    };
    const created = await withTenantContext(testDb.appDb, seeded.organizationId, (tx) =>
      createUser(tx, adminActingUser, {
        teamId: seeded.teamId,
        username: `member-${suffix}`,
        email,
        password,
        role: "member",
      }),
    );
    return { userId: created.id, email, password };
  }

  it("forks a skill to a new owner and returns 201", async () => {
    const seeded = await seedOrgWithAdmin(testDb.authDb);
    const name = `fork-me-${randomUUID()}`;
    const source = await seedSkill(seeded, name);
    const member = await seedMember(seeded);
    const cookie = await loginAndBuildCookie(testDb.authDb, member.email, member.password);
    const { POST } = route();

    const response = await POST(
      new Request(`http://x/api/skills/${name}/fork`, {
        method: "POST",
        headers: { cookie, "content-type": "application/json" },
        body: JSON.stringify({ ownerType: "user", ownerId: member.userId, name: `copy-of-${name}` }),
      }),
      { params: Promise.resolve({ name }) },
    );

    expect(response.status).toBe(201);
    const body = await response.json();
    expect(body.forkedFromSkillId).toBe(source.id);
    expect(body.ownerId).toBe(member.userId);
  });

  it("returns 404 SKILL_NOT_FOUND forking a nonexistent skill", async () => {
    const seeded = await seedOrgWithAdmin(testDb.authDb);
    const cookie = await loginAndBuildCookie(testDb.authDb, seeded.adminEmail, seeded.adminPassword);
    const { POST } = route();
    const bogusName = `bogus-${randomUUID()}`;

    const response = await POST(
      new Request(`http://x/api/skills/${bogusName}/fork`, {
        method: "POST",
        headers: { cookie, "content-type": "application/json" },
        body: JSON.stringify({ ownerType: "user", ownerId: seeded.adminUserId, name: "irrelevant-name" }),
      }),
      { params: Promise.resolve({ name: bogusName }) },
    );

    expect(response.status).toBe(404);
    const body = await response.json();
    expect(body.error.code).toBe("SKILL_NOT_FOUND");
  });

  it("returns 422 CANNOT_FORK_OWN_SKILL when the owner forks their own skill", async () => {
    const seeded = await seedOrgWithAdmin(testDb.authDb);
    const name = `own-fork-${randomUUID()}`;
    await seedSkill(seeded, name);
    const cookie = await loginAndBuildCookie(testDb.authDb, seeded.adminEmail, seeded.adminPassword);
    const { POST } = route();

    const response = await POST(
      new Request(`http://x/api/skills/${name}/fork`, {
        method: "POST",
        headers: { cookie, "content-type": "application/json" },
        body: JSON.stringify({ ownerType: "user", ownerId: seeded.adminUserId, name: "irrelevant-name" }),
      }),
      { params: Promise.resolve({ name }) },
    );

    expect(response.status).toBe(422);
    const body = await response.json();
    expect(body.error.code).toBe("CANNOT_FORK_OWN_SKILL");
  });

  it("returns 403 SUBSCRIBER_NOT_AUTHORIZED forking into a different user's ownership", async () => {
    // Source is owned by the admin; the caller (memberB) tries to fork into
    // a *third* user's ownership (memberC) — distinct from both the
    // source's owner and memberB themselves, so this hits
    // SubscriberNotAuthorizedError rather than CannotForkOwnSkillError.
    const seeded = await seedOrgWithAdmin(testDb.authDb);
    const name = `unauthorized-fork-${randomUUID()}`;
    await seedSkill(seeded, name);
    const memberB = await seedMember(seeded);
    const memberC = await seedMember(seeded);
    const cookie = await loginAndBuildCookie(testDb.authDb, memberB.email, memberB.password);
    const { POST } = route();

    const response = await POST(
      new Request(`http://x/api/skills/${name}/fork`, {
        method: "POST",
        headers: { cookie, "content-type": "application/json" },
        body: JSON.stringify({ ownerType: "user", ownerId: memberC.userId, name: "irrelevant-name" }),
      }),
      { params: Promise.resolve({ name }) },
    );

    expect(response.status).toBe(403);
    const body = await response.json();
    expect(body.error.code).toBe("SUBSCRIBER_NOT_AUTHORIZED");
  });

  it("returns 422 VALIDATION_FAILED for a missing ownerId", async () => {
    const seeded = await seedOrgWithAdmin(testDb.authDb);
    const name = `bad-fork-body-${randomUUID()}`;
    await seedSkill(seeded, name);
    const cookie = await loginAndBuildCookie(testDb.authDb, seeded.adminEmail, seeded.adminPassword);
    const { POST } = route();

    const response = await POST(
      new Request(`http://x/api/skills/${name}/fork`, {
        method: "POST",
        headers: { cookie, "content-type": "application/json" },
        body: JSON.stringify({ ownerType: "user" }),
      }),
      { params: Promise.resolve({ name }) },
    );

    expect(response.status).toBe(422);
    const body = await response.json();
    expect(body.error.code).toBe("VALIDATION_FAILED");
  });

  it("returns 401 with no credential", async () => {
    const { POST } = route();
    const response = await POST(
      new Request("http://x/api/skills/anything/fork", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ownerType: "user", ownerId: "anything" }),
      }),
      { params: Promise.resolve({ name: "anything" }) },
    );
    expect(response.status).toBe(401);
  });
});
