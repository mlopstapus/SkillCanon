import { randomUUID } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { authenticateApiKey } from "@/bcs/identity-access";
import { McpSessionManager, extractBearerApiKey, resolveMcpCaller } from "./mcp-session";

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
