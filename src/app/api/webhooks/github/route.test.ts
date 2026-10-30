import { createHmac, randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { startTestDb, type TestDb } from "@/shared/db/test-helpers";
import { handlePost } from "./route";

describe("POST /api/webhooks/github", () => {
  let testDb: TestDb;
  beforeAll(async () => {
    testDb = await startTestDb();
  }, 120_000);
  afterAll(async () => testDb.teardown());

  const send = (body: string, headers: Record<string, string>) =>
    handlePost(new Request("http://x/api/webhooks/github", { method: "POST", body, headers }), { db: testDb.authDb });

  it("is 503 when the App is not configured", async () => {
    vi.unstubAllEnvs();
    expect((await send("{}", {})).status).toBe(503);
  });

  it("is 401 for a bad signature and 200 for a valid one", async () => {
    vi.stubEnv("GITHUB_APP_ID", "1");
    vi.stubEnv("GITHUB_APP_SLUG", "s");
    vi.stubEnv("GITHUB_APP_PRIVATE_KEY", "k");
    vi.stubEnv("GITHUB_APP_WEBHOOK_SECRET", "whsec");
    const body = JSON.stringify({ action: "opened" });
    const meta = { "x-github-delivery": randomUUID(), "x-github-event": "pull_request" };
    expect((await send(body, { ...meta, "x-hub-signature-256": "sha256=bad" })).status).toBe(401);
    const good = `sha256=${createHmac("sha256", "whsec").update(body).digest("hex")}`;
    const ok = await send(body, { ...meta, "x-hub-signature-256": good });
    expect(ok.status).toBe(200);
    vi.unstubAllEnvs();
  });
});
