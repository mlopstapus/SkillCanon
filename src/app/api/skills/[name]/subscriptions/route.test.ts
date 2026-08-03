import { randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createUser } from "@/bcs/identity-access";
import { createPrompt } from "@/bcs/prompt-registry";
import { withTenantContext } from "@/shared/db";
import { startTestDb, type TestDb } from "@/shared/db/test-helpers";
import { withApiRoute } from "@/shared/api/handler";
import { loginAndBuildCookie, seedOrgWithAdmin, type SeededOrg } from "@/shared/api/test-helpers";
import { handleGet, handlePost } from "./route";

describe("/api/skills/[name]/subscriptions", () => {
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
      GET: withApiRoute(handleGet, deps),
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

  it("subscribes a user to another user's skill and returns 201", async () => {
    const seeded = await seedOrgWithAdmin(testDb.authDb);
    const name = `shared-skill-${randomUUID()}`;
    await seedSkill(seeded, name);
    const member = await seedMember(seeded);
    const cookie = await loginAndBuildCookie(testDb.authDb, member.email, member.password);
    const { POST } = route();

    const response = await POST(
      new Request(`http://x/api/skills/${name}/subscriptions`, {
        method: "POST",
        headers: { cookie, "content-type": "application/json" },
        body: JSON.stringify({ subscriberType: "user", subscriberId: member.userId }),
      }),
      { params: Promise.resolve({ name }) },
    );

    expect(response.status).toBe(201);
    const body = await response.json();
    expect(body.subscriberType).toBe("user");
    expect(body.subscriberId).toBe(member.userId);
  });

  it("returns 404 SKILL_NOT_FOUND subscribing to a nonexistent skill", async () => {
    const seeded = await seedOrgWithAdmin(testDb.authDb);
    const cookie = await loginAndBuildCookie(testDb.authDb, seeded.adminEmail, seeded.adminPassword);
    const { POST } = route();
    const bogusName = `bogus-${randomUUID()}`;

    const response = await POST(
      new Request(`http://x/api/skills/${bogusName}/subscriptions`, {
        method: "POST",
        headers: { cookie, "content-type": "application/json" },
        body: JSON.stringify({ subscriberType: "user", subscriberId: seeded.adminUserId }),
      }),
      { params: Promise.resolve({ name: bogusName }) },
    );

    expect(response.status).toBe(404);
    const body = await response.json();
    expect(body.error.code).toBe("SKILL_NOT_FOUND");
  });

  it("returns 422 CANNOT_SUBSCRIBE_OWN_SKILL when the owner subscribes to their own skill", async () => {
    const seeded = await seedOrgWithAdmin(testDb.authDb);
    const name = `own-skill-${randomUUID()}`;
    await seedSkill(seeded, name);
    const cookie = await loginAndBuildCookie(testDb.authDb, seeded.adminEmail, seeded.adminPassword);
    const { POST } = route();

    const response = await POST(
      new Request(`http://x/api/skills/${name}/subscriptions`, {
        method: "POST",
        headers: { cookie, "content-type": "application/json" },
        body: JSON.stringify({ subscriberType: "user", subscriberId: seeded.adminUserId }),
      }),
      { params: Promise.resolve({ name }) },
    );

    expect(response.status).toBe(422);
    const body = await response.json();
    expect(body.error.code).toBe("CANNOT_SUBSCRIBE_OWN_SKILL");
  });

  it("returns 403 SUBSCRIBER_NOT_AUTHORIZED subscribing on behalf of a different user", async () => {
    // Source is owned by the admin; the caller (memberB) tries to subscribe
    // a *third* user (memberC) — distinct from both the source's owner and
    // memberB themselves, so this hits SubscriberNotAuthorizedError rather
    // than CannotSubscribeToOwnSkillError.
    const seeded = await seedOrgWithAdmin(testDb.authDb);
    const name = `unauthorized-subscribe-${randomUUID()}`;
    await seedSkill(seeded, name);
    const memberB = await seedMember(seeded);
    const memberC = await seedMember(seeded);
    const cookie = await loginAndBuildCookie(testDb.authDb, memberB.email, memberB.password);
    const { POST } = route();

    const response = await POST(
      new Request(`http://x/api/skills/${name}/subscriptions`, {
        method: "POST",
        headers: { cookie, "content-type": "application/json" },
        body: JSON.stringify({ subscriberType: "user", subscriberId: memberC.userId }),
      }),
      { params: Promise.resolve({ name }) },
    );

    expect(response.status).toBe(403);
    const body = await response.json();
    expect(body.error.code).toBe("SUBSCRIBER_NOT_AUTHORIZED");
  });

  it("returns 422 VALIDATION_FAILED for a missing subscriberId", async () => {
    const seeded = await seedOrgWithAdmin(testDb.authDb);
    const name = `bad-body-${randomUUID()}`;
    await seedSkill(seeded, name);
    const cookie = await loginAndBuildCookie(testDb.authDb, seeded.adminEmail, seeded.adminPassword);
    const { POST } = route();

    const response = await POST(
      new Request(`http://x/api/skills/${name}/subscriptions`, {
        method: "POST",
        headers: { cookie, "content-type": "application/json" },
        body: JSON.stringify({ subscriberType: "user" }),
      }),
      { params: Promise.resolve({ name }) },
    );

    expect(response.status).toBe(422);
    const body = await response.json();
    expect(body.error.code).toBe("VALIDATION_FAILED");
  });

  it("lists subscriptions for a skill", async () => {
    const seeded = await seedOrgWithAdmin(testDb.authDb);
    const name = `list-subs-${randomUUID()}`;
    await seedSkill(seeded, name);
    const member = await seedMember(seeded);
    const memberCookie = await loginAndBuildCookie(testDb.authDb, member.email, member.password);
    const adminCookie = await loginAndBuildCookie(testDb.authDb, seeded.adminEmail, seeded.adminPassword);
    const { POST, GET } = route();

    await POST(
      new Request(`http://x/api/skills/${name}/subscriptions`, {
        method: "POST",
        headers: { cookie: memberCookie, "content-type": "application/json" },
        body: JSON.stringify({ subscriberType: "user", subscriberId: member.userId }),
      }),
      { params: Promise.resolve({ name }) },
    );

    const response = await GET(
      new Request(`http://x/api/skills/${name}/subscriptions`, { headers: { cookie: adminCookie } }),
      { params: Promise.resolve({ name }) },
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toHaveLength(1);
    expect(body[0].subscriberId).toBe(member.userId);
  });

  it("returns 404 SKILL_NOT_FOUND listing subscriptions for a nonexistent skill", async () => {
    const seeded = await seedOrgWithAdmin(testDb.authDb);
    const cookie = await loginAndBuildCookie(testDb.authDb, seeded.adminEmail, seeded.adminPassword);
    const { GET } = route();
    const bogusName = `bogus-${randomUUID()}`;

    const response = await GET(
      new Request(`http://x/api/skills/${bogusName}/subscriptions`, { headers: { cookie } }),
      { params: Promise.resolve({ name: bogusName }) },
    );

    expect(response.status).toBe(404);
    const body = await response.json();
    expect(body.error.code).toBe("SKILL_NOT_FOUND");
  });

  it("returns 401 with no credential", async () => {
    const { GET } = route();
    const response = await GET(new Request("http://x/api/skills/anything/subscriptions"), {
      params: Promise.resolve({ name: "anything" }),
    });
    expect(response.status).toBe(401);
  });
});
