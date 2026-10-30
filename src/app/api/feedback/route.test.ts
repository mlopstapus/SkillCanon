import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createPrompt, publishVersion, type PromptActor } from "@/bcs/prompt-registry";
import { withTenantContext } from "@/shared/db";
import { startTestDb, type TestDb } from "@/shared/db/test-helpers";
import { withApiRoute } from "@/shared/api/handler";
import { loginAndBuildCookie, seedOrgWithAdmin } from "@/shared/api/test-helpers";
import { handlePost as expandHandler } from "../skills/[name]/expand/route";
import { handlePost } from "./route";

describe("POST /api/feedback", () => {
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

  async function serve() {
    const seeded = await seedOrgWithAdmin(testDb.authDb);
    const cookie = await loginAndBuildCookie(testDb.authDb, seeded.adminEmail, seeded.adminPassword);
    const name = `skill-${randomUUID()}`;
    const actor: PromptActor = { organizationId: seeded.organizationId, userId: seeded.adminUserId };
    await withTenantContext(testDb.appDb, seeded.organizationId, async (tx) => {
      await createPrompt(tx, actor, { organizationId: seeded.organizationId, name });
      await publishVersion(tx, actor, {
        organizationId: seeded.organizationId,
        promptName: name,
        version: "1",
        mainFile: { content: "Hello" },
      });
    });
    const response = await withApiRoute(expandHandler, { authDb: testDb.authDb, db: testDb.appDb })(
      new Request(`http://x/api/skills/${name}/expand`, {
        method: "POST",
        headers: { cookie, "content-type": "application/json" },
        body: "{}",
      }),
      { params: Promise.resolve({ name }) },
    );
    return { seeded, cookie, serveId: (await response.json()).serveId as string };
  }

  const post = (cookie: string, body: unknown) =>
    withApiRoute(handlePost, { authDb: testDb.authDb, db: testDb.appDb })(
      new Request("http://x/api/feedback", {
        method: "POST",
        headers: { cookie, "content-type": "application/json" },
        body: JSON.stringify(body),
      }),
      { params: Promise.resolve({}) },
    );

  it("stores a signal and a note against the serve and writes an audit event per filing", async () => {
    const { seeded, cookie, serveId } = await serve();

    const signal = await post(cookie, { serveId, kind: "signal", rating: "down" });
    const note = await post(cookie, { serveId, kind: "note", rating: "up", text: "  Works well  " });

    expect(signal.status).toBe(201);
    expect(await signal.json()).toMatchObject({ serveId, kind: "signal", rating: "down", text: null, userId: seeded.adminUserId });
    expect(note.status).toBe(201);
    expect(await note.json()).toMatchObject({ kind: "note", rating: "up", text: "Works well" });

    const audits = Array.from(
      await testDb.ownerDb.execute<{ resource_id: string }>(
        sql`select resource_id from audit.audit_events where organization_id = ${seeded.organizationId} and action = 'feedback.created'`,
      ),
    );
    expect(audits).toHaveLength(2);
    const rows = Array.from(
      await testDb.ownerDb.execute<{ serve_id: string }>(
        sql`select serve_id from distribution.feedback where organization_id = ${seeded.organizationId}`,
      ),
    );
    expect(rows.map((r) => r.serve_id)).toEqual([serveId, serveId]);
  });

  it("422s a note without text, a signal without a rating, and over-long text", async () => {
    const { cookie, serveId } = await serve();

    for (const body of [
      { serveId, kind: "note", rating: "up" },
      { serveId, kind: "note", text: "   " },
      { serveId, kind: "signal" },
      { serveId, kind: "note", text: "x".repeat(4001) },
    ]) {
      const response = await post(cookie, body);
      expect(response.status).toBe(422);
      expect((await response.json()).error.code).toBe("FEEDBACK_INVALID");
    }
  });

  it("404s a serve from another organization, an unknown id, and a malformed id, without writing anything", async () => {
    const { serveId } = await serve();
    const other = await seedOrgWithAdmin(testDb.authDb);
    const otherCookie = await loginAndBuildCookie(testDb.authDb, other.adminEmail, other.adminPassword);

    for (const id of [serveId, randomUUID(), "not-a-uuid"]) {
      const response = await post(otherCookie, { serveId: id, kind: "signal", rating: "up" });
      expect(response.status).toBe(404);
      expect((await response.json()).error.code).toBe("SERVE_NOT_FOUND");
    }
    const rows = Array.from(
      await testDb.ownerDb.execute(sql`select 1 from distribution.feedback where organization_id = ${other.organizationId}`),
    );
    expect(rows).toHaveLength(0);
  });
});
