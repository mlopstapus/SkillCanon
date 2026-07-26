import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { startTestDb, type TestDb } from "@/shared/db/test-helpers";
import { insert } from "./audit-events-repo";

describe("audit-events-repo insert", () => {
  let testDb: TestDb;

  beforeAll(async () => {
    testDb = await startTestDb();
  }, 120_000);

  afterAll(async () => {
    await testDb.teardown();
  });

  it("inserts one row with all fields set", async () => {
    const organizationId = randomUUID();
    const actorUserId = randomUUID();
    const resourceId = actorUserId;

    const row = await insert(testDb.appDb, {
      organizationId,
      actorUserId,
      actorApiKeyId: null,
      action: "user.login",
      resourceType: "user",
      resourceId,
      before: null,
      after: null,
      transport: "web",
      sourceIp: "203.0.113.10",
    });

    expect(row.id).toBeTruthy();
    expect(row.organizationId).toBe(organizationId);
    expect(row.actorUserId).toBe(actorUserId);
    expect(row.action).toBe("user.login");
    expect(row.resourceType).toBe("user");
    expect(row.resourceId).toBe(resourceId);
    expect(row.transport).toBe("web");
    expect(row.sourceIp).toBe("203.0.113.10");
    expect(row.createdAt).toBeTruthy();
  });

  it("inserts one row with organizationId/resourceId both null (unknown-email case)", async () => {
    const row = await insert(testDb.appDb, {
      organizationId: null,
      actorUserId: null,
      actorApiKeyId: null,
      action: "user.login_failed",
      resourceType: "user",
      resourceId: null,
      before: null,
      after: null,
      transport: "web",
      sourceIp: null,
    });

    expect(row.id).toBeTruthy();
    expect(row.organizationId).toBeNull();
    expect(row.actorUserId).toBeNull();
    expect(row.resourceId).toBeNull();
    expect(row.transport).toBe("web");
    expect(row.sourceIp).toBeNull();
  });
});
