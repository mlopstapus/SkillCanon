import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { startTestDb, type TestDb } from "@/shared/db/test-helpers";
import { auditEvents } from "../infrastructure/schema";
import { record } from "./record";
import { eq } from "drizzle-orm";

describe("record", () => {
  let testDb: TestDb;

  beforeAll(async () => {
    testDb = await startTestDb();
  }, 120_000);

  afterAll(async () => {
    await testDb.teardown();
  });

  it("inserts exactly one row matching the given event", async () => {
    const organizationId = randomUUID();
    const actorUserId = randomUUID();

    await testDb.appDb.transaction(async (tx) => {
      await record(tx, {
        organizationId,
        actorUserId,
        actorApiKeyId: null,
        action: "user.login",
        resourceType: "user",
        resourceId: actorUserId,
        transport: "web",
        sourceIp: "203.0.113.10",
      });
    });

    const rows = await testDb.appDb
      .select()
      .from(auditEvents)
      .where(eq(auditEvents.actorUserId, actorUserId));

    expect(rows).toHaveLength(1);
    expect(rows[0]?.action).toBe("user.login");
    expect(rows[0]?.organizationId).toBe(organizationId);
    expect(rows[0]?.transport).toBe("web");
    expect(rows[0]?.sourceIp).toBe("203.0.113.10");
  });

  it("strips password_hash/key_hash/raw-token fields nested inside before/after before storage", async () => {
    const organizationId = randomUUID();
    const resourceId = randomUUID();

    await testDb.appDb.transaction(async (tx) => {
      await record(tx, {
        organizationId,
        actorUserId: null,
        actorApiKeyId: null,
        action: "user.updated",
        resourceType: "user",
        resourceId,
        transport: "web",
        sourceIp: null,
        before: { email: "old@example.com", password_hash: "$2b$12$secret" },
        after: {
          email: "new@example.com",
          nested: { key_hash: "abcdef", token: "raw-token-value" },
        },
      });
    });

    const rows = await testDb.appDb
      .select()
      .from(auditEvents)
      .where(eq(auditEvents.resourceId, resourceId));

    expect(rows).toHaveLength(1);
    const stored = JSON.stringify(rows[0]);
    expect(stored).not.toContain("$2b$12$secret");
    expect(stored).not.toContain("abcdef");
    expect(stored).not.toContain("raw-token-value");
    expect((rows[0]?.before as Record<string, unknown>).email).toBe(
      "old@example.com",
    );
  });
});
