import { randomUUID } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { authenticateApiKey } from "@/bcs/identity-access";
import { McpSessionManager, extractBearerApiKey, resolveMcpCaller, startMcpSessionCleanup } from "./mcp-session";

vi.mock("@/bcs/identity-access", () => ({
  authenticateApiKey: vi.fn(),
}));

const authenticateApiKeyMock = vi.mocked(authenticateApiKey);

function caller(userId = randomUUID()) {
  return {
    user: {
      id: userId,
      orgId: randomUUID(),
      teamId: randomUUID(),
      role: "admin" as const,
      email: `${userId}@example.com`,
    },
    scopes: ["mcp:read"],
  };
}

describe("McpSessionManager", () => {
  beforeEach(() => {
    authenticateApiKeyMock.mockReset();
  });

  it("tracks context delivery and cleanup without storing credentials", () => {
    const manager = new McpSessionManager();
    const session = manager.getOrCreate("session-1", new Date("2026-08-03T00:00:00Z"));

    expect(session.contextDelivered).toBe(false);
    expect(JSON.stringify(session)).not.toContain("sh_secret");

    manager.markContextDelivered("session-1");
    expect(manager.get("session-1")?.contextDelivered).toBe(true);

    const removed = manager.cleanupStale(1000, new Date(Date.now() + 2_000));
    expect(removed).toBe(1);
    expect(manager.activeCount).toBe(0);
  });

  it("caches resolved callers per session and revalidates after reset", async () => {
    const manager = new McpSessionManager();
    const resolved = caller();
    authenticateApiKeyMock.mockResolvedValue(resolved);

    await expect(resolveMcpCaller({} as never, "sh_secret_one", "session-1", manager)).resolves.toEqual(resolved);
    await expect(resolveMcpCaller({} as never, "sh_secret_one", "session-1", manager)).resolves.toEqual(resolved);
    expect(authenticateApiKeyMock).toHaveBeenCalledTimes(1);

    manager.reset();
    await expect(resolveMcpCaller({} as never, "sh_secret_one", "session-1", manager)).resolves.toEqual(resolved);
    expect(authenticateApiKeyMock).toHaveBeenCalledTimes(2);
  });

  it("extracts bearer API keys without accepting other authorization schemes", () => {
    expect(extractBearerApiKey(new Request("http://x", { headers: { authorization: "Bearer sh_live" } }))).toBe("sh_live");
    expect(extractBearerApiKey(new Request("http://x", { headers: { authorization: "Basic abc" } }))).toBeNull();
    expect(extractBearerApiKey(new Request("http://x"))).toBeNull();
  });
});

describe("startMcpSessionCleanup", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("removes a session with no activity for longer than maxAgeMs, without any external trigger", () => {
    const manager = new McpSessionManager();
    manager.getOrCreate("stale-session", new Date());

    const stop = startMcpSessionCleanup(manager, { maxAgeMs: 1000, intervalMs: 500 });
    vi.advanceTimersByTime(1600);
    stop();

    expect(manager.get("stale-session")).toBeUndefined();
    expect(manager.activeCount).toBe(0);
  });

  it("never removes a session whose activity is within maxAgeMs", () => {
    const manager = new McpSessionManager();
    const stop = startMcpSessionCleanup(manager, { maxAgeMs: 1000, intervalMs: 200 });

    // Touch the session just before each sweep so it never goes stale.
    for (let i = 0; i < 5; i += 1) {
      vi.advanceTimersByTime(200);
      manager.getOrCreate("active-session");
    }
    stop();

    expect(manager.get("active-session")).toBeDefined();
    expect(manager.activeCount).toBe(1);
  });

});

describe("startMcpSessionCleanup — process exit", () => {
  it("does not keep the process alive — the underlying interval is unref()'d", () => {
    const manager = new McpSessionManager();
    const realSetInterval = setInterval;
    let captured: NodeJS.Timeout | undefined;
    const spy = vi.spyOn(global, "setInterval").mockImplementation((...args: Parameters<typeof setInterval>) => {
      captured = realSetInterval(...args);
      return captured;
    });

    const stop = startMcpSessionCleanup(manager, { maxAgeMs: 1000, intervalMs: 500 });

    expect(captured).toBeDefined();
    expect(captured!.hasRef()).toBe(false);

    stop();
    spy.mockRestore();
  });
});
