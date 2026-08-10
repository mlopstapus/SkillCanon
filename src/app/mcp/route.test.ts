import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createApiKey } from "@/bcs/identity-access";
import { mcpSessionManager } from "@/bcs/distribution";
import { seedOrgWithAdmin, type SeededOrg } from "@/shared/api/test-helpers";
import { withTenantContext } from "@/shared/db";
import { startTestDb, type TestDb } from "@/shared/db/test-helpers";
import { _test } from "./route";

function initializeRequest(rawKey: string): Request {
  return new Request("http://x/mcp", {
    method: "POST",
    headers: { authorization: `Bearer ${rawKey}`, "content-type": "application/json", accept: "application/json, text/event-stream" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: {
        protocolVersion: "2025-06-18",
        capabilities: {},
        clientInfo: { name: "mcp-tools-test-client", version: "1.0.0" },
      },
    }),
  });
}

describe("/mcp route", () => {
  it("rejects missing bearer credentials without tenant-scoped dependencies", async () => {
    const response = await _test.handleMcpRequest(new Request("http://x/mcp", { method: "POST" }));

    expect(response.status).toBe(401);
    const body = await response.json();
    expect(body.error.message).toBe("Authentication required");
  });

  it("does not echo raw API key material on malformed non-initialize requests", async () => {
    const rawKey = "sh_super_secret_raw_key_value";
    const response = await _test.handleMcpRequest(
      new Request("http://x/mcp", {
        method: "POST",
        headers: { authorization: `Bearer ${rawKey}`, "content-type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", method: "tools/list", id: 1 }),
      }),
      {
        authDb: {} as never,
        db: {} as never,
      },
    );

    const text = await response.text();
    expect(text).not.toContain(rawKey);
    expect(text).not.toContain(rawKey.slice(0, 8));
  });

  describe("with a real database", () => {
    let testDb: TestDb;

    beforeAll(async () => {
      testDb = await startTestDb();
    }, 120_000);

    afterAll(async () => {
      await testDb.teardown();
    });

    beforeEach(() => {
      vi.stubEnv("STRIPE_ENABLED", "true");
    });

    afterEach(() => {
      vi.unstubAllEnvs();
      vi.restoreAllMocks();
    });

    async function seedWithApiKey(name: string) {
      const seeded = await seedOrgWithAdmin(testDb.authDb);
      const { rawKey } = await withTenantContext(testDb.appDb, seeded.organizationId, (tx) =>
        createApiKey(
          tx,
          { id: seeded.adminUserId, orgId: seeded.organizationId, teamId: seeded.teamId, role: "admin", email: seeded.adminEmail },
          { name, scopes: ["prompts:read"] },
        ),
      );
      return { seeded, rawKey };
    }

    function capturedLogText(infoSpy: ReturnType<typeof vi.spyOn>, warnSpy: ReturnType<typeof vi.spyOn>): string {
      return JSON.stringify([...infoSpy.mock.calls, ...warnSpy.mock.calls]);
    }

    describe("no raw API key in log output (tenet S3)", () => {
      it("never logs the raw key across a real authenticated round trip (success path)", async () => {
        const { rawKey } = await seedWithApiKey("mcp-test-key");
        const infoSpy = vi.spyOn(_test.log, "info");
        const warnSpy = vi.spyOn(_test.log, "warn");

        const response = await _test.handleMcpRequest(initializeRequest(rawKey), { authDb: testDb.authDb, db: testDb.appDb });

        expect(response.status).toBeLessThan(500);
        const text = capturedLogText(infoSpy, warnSpy);
        expect(text).not.toContain(rawKey);
        expect(text).not.toContain(rawKey.slice(0, 8));
        expect(infoSpy.mock.calls.length + warnSpy.mock.calls.length).toBeGreaterThan(0);
      });

      it("never logs a real, well-formed-but-wrong raw key on rejection (a real DB lookup, not just a missing header)", async () => {
        const { rawKey } = await seedWithApiKey("mcp-test-key-2");
        const wrongButWellFormedKey = rawKey.slice(0, -4) + "0000";
        const infoSpy = vi.spyOn(_test.log, "info");
        const warnSpy = vi.spyOn(_test.log, "warn");

        const response = await _test.handleMcpRequest(initializeRequest(wrongButWellFormedKey), { authDb: testDb.authDb, db: testDb.appDb });

        expect(response.status).toBe(401);
        const text = capturedLogText(infoSpy, warnSpy);
        expect(text).not.toContain(wrongButWellFormedKey);
        expect(text).not.toContain(wrongButWellFormedKey.slice(0, 8));
        expect(infoSpy.mock.calls.length + warnSpy.mock.calls.length).toBeGreaterThan(0);
      });
    });

    describe("session-identity isolation across brand-new sessions", () => {
      // Regression coverage for a real bug found while writing this suite:
      // transportOrResponse.sessionId is only assigned once the SDK
      // processes a request's body, so a brand-new session's very first
      // (initialize) message always resolves its caller under a fallback
      // key. A shared literal fallback ("pending") meant every such
      // first-message request cached into the *same* McpSessionManager
      // bucket — once any one caller authenticated there, every later new
      // session's first message silently reused that cached caller instead
      // of validating its own bearer key. Fixed in route.ts by generating a
      // fresh random id per request instead of a shared literal.
      it("authenticates two sequential brand-new sessions as their own distinct callers, not each other's", async () => {
        const first = await seedWithApiKey("mcp-session-a-key");
        const second = await seedWithApiKey("mcp-session-b-key");
        const deps = { authDb: testDb.authDb, db: testDb.appDb };

        const firstResponse = await _test.handleMcpRequest(initializeRequest(first.rawKey), deps);
        expect(firstResponse.status).toBeLessThan(300);

        const secondResponse = await _test.handleMcpRequest(initializeRequest(second.rawKey), deps);
        expect(secondResponse.status).toBeLessThan(300);

        // Reject the second session's *first* org's key too — must not have
        // been silently authenticated as the first caller under a shared
        // fallback bucket.
        const wrongKeyResponse = await _test.handleMcpRequest(initializeRequest(first.rawKey.slice(0, -4) + "0000"), deps);
        expect(wrongKeyResponse.status).toBe(401);
      });
    });

    describe("process restart mid-session (PDR-008 ephemeral state)", () => {
      // Session state (transports Map, McpSessionManager) is entirely
      // in-memory per PDR-008 — a real process restart clears both. The
      // guarantee this covers: a session id that predates the restart is
      // cleanly rejected (not silently misrouted or hung), and the same
      // client can recover with exactly one further request — a fresh
      // initialize call reusing its existing bearer key — not a broken
      // session requiring new credentials or manual reconfiguration.
      it("rejects a pre-restart session id, then recovers in a single re-initialize round trip", async () => {
        const { rawKey } = await seedWithApiKey("mcp-restart-key");
        const deps = { authDb: testDb.authDb, db: testDb.appDb };

        const initResponse = await _test.handleMcpRequest(initializeRequest(rawKey), deps);
        expect(initResponse.status).toBeLessThan(300);
        const staleSessionId = initResponse.headers.get("mcp-session-id");
        expect(staleSessionId).toBeTruthy();

        // Simulate a process restart: both in-memory stores are cleared,
        // exactly as they would be on a fresh process boot.
        _test.transports.clear();
        mcpSessionManager.reset();

        const staleRequest = new Request("http://x/mcp", {
          method: "POST",
          headers: {
            authorization: `Bearer ${rawKey}`,
            "content-type": "application/json",
            accept: "application/json, text/event-stream",
            "mcp-session-id": staleSessionId!,
          },
          body: JSON.stringify({ jsonrpc: "2.0", id: 2, method: "tools/list" }),
        });
        const staleResponse = await _test.handleMcpRequest(staleRequest, deps);
        expect(staleResponse.status).toBe(404);

        // Exactly one further request — a normal re-initialize with the
        // same bearer key, no different from a first-ever connection —
        // is enough to recover a fully working session.
        const recoveredResponse = await _test.handleMcpRequest(initializeRequest(rawKey), deps);
        expect(recoveredResponse.status).toBeLessThan(300);
        expect(recoveredResponse.headers.get("mcp-session-id")).toBeTruthy();
      });
    });
  });
});
