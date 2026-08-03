import { randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createUser } from "@/bcs/identity-access";
import { createPrompt, subscribeSkill } from "@/bcs/prompt-registry";
import { withTenantContext } from "@/shared/db";
import { startTestDb, type TestDb } from "@/shared/db/test-helpers";
import { withApiRoute } from "@/shared/api/handler";
import { loginAndBuildCookie, seedOrgWithAdmin, type SeededOrg } from "@/shared/api/test-helpers";
import { handleDelete } from "./route";

describe("/api/skills/[name]/subscriptions/[subscriptionId]", () => {
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
      DELETE: withApiRoute(handleDelete, deps),
    };
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
    return {
      userId: created.id,
      email,
      password,
      actingUser: { id: created.id, orgId: seeded.organizationId, teamId: seeded.teamId, role: "member" as const, email },
    };
  }

  async function seedSkillWithSubscription(seeded: SeededOrg, name: string, subscriber: { userId: string; actingUser: { id: string; orgId: string; teamId: string | null; role: "admin" | "member"; email: string } }) {
    const skill = await withTenantContext(testDb.appDb, seeded.organizationId, (tx) =>
      createPrompt(tx, { organizationId: seeded.organizationId, userId: seeded.adminUserId }, {
        organizationId: seeded.organizationId,
        name,
      }),
    );
    const subscription = await withTenantContext(testDb.appDb, seeded.organizationId, (tx) =>
      subscribeSkill(tx, subscriber.actingUser, skill.id, {
        subscriberType: "user",
        subscriberId: subscriber.userId,
      }),
    );
    return { skill, subscription };
  }

  it("unsubscribes and returns 204", async () => {
    const seeded = await seedOrgWithAdmin(testDb.authDb);
    const name = `unsub-me-${randomUUID()}`;
    const member = await seedMember(seeded);
    const { subscription } = await seedSkillWithSubscription(seeded, name, member);
    const cookie = await loginAndBuildCookie(testDb.authDb, member.email, member.password);
    const { DELETE } = route();

    const response = await DELETE(
      new Request(`http://x/api/skills/${name}/subscriptions/${subscription.id}`, {
        method: "DELETE",
        headers: { cookie },
      }),
      { params: Promise.resolve({ name, subscriptionId: subscription.id }) },
    );

    expect(response.status).toBe(204);
  });

  it("returns 404 SUBSCRIPTION_NOT_FOUND for a bogus subscription id", async () => {
    const seeded = await seedOrgWithAdmin(testDb.authDb);
    const cookie = await loginAndBuildCookie(testDb.authDb, seeded.adminEmail, seeded.adminPassword);
    const { DELETE } = route();
    const bogusId = randomUUID();

    const response = await DELETE(
      new Request(`http://x/api/skills/anything/subscriptions/${bogusId}`, {
        method: "DELETE",
        headers: { cookie },
      }),
      { params: Promise.resolve({ name: "anything", subscriptionId: bogusId }) },
    );

    expect(response.status).toBe(404);
    const body = await response.json();
    expect(body.error.code).toBe("SUBSCRIPTION_NOT_FOUND");
  });

  it("returns 403 SUBSCRIBER_NOT_AUTHORIZED when a different user tries to unsubscribe someone else", async () => {
    const seeded = await seedOrgWithAdmin(testDb.authDb);
    const name = `unauthorized-unsub-${randomUUID()}`;
    const member = await seedMember(seeded);
    const otherMember = await seedMember(seeded);
    const { subscription } = await seedSkillWithSubscription(seeded, name, member);
    const cookie = await loginAndBuildCookie(testDb.authDb, otherMember.email, otherMember.password);
    const { DELETE } = route();

    const response = await DELETE(
      new Request(`http://x/api/skills/${name}/subscriptions/${subscription.id}`, {
        method: "DELETE",
        headers: { cookie },
      }),
      { params: Promise.resolve({ name, subscriptionId: subscription.id }) },
    );

    expect(response.status).toBe(403);
    const body = await response.json();
    expect(body.error.code).toBe("SUBSCRIBER_NOT_AUTHORIZED");
  });

  it("returns 401 with no credential", async () => {
    const { DELETE } = route();
    const response = await DELETE(new Request("http://x/api/skills/anything/subscriptions/anything", { method: "DELETE" }), {
      params: Promise.resolve({ name: "anything", subscriptionId: "anything" }),
    });
    expect(response.status).toBe(401);
  });
});
