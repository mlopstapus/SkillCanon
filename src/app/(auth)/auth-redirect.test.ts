import { describe, expect, it, vi } from "vitest";
import type { AppSessionUser } from "@/bcs/identity-access";
import { resolveAuthPageAccess } from "./auth-redirect";

const user: AppSessionUser = {
  id: "user-123",
  orgId: "org-123",
  teamId: "team-123",
  role: "admin",
  email: "jane@example.com",
  displayName: "Jane Doe",
  teamName: "Platform",
};

describe("resolveAuthPageAccess", () => {
  it("returns unauthenticated when no session resolves", async () => {
    await expect(
      resolveAuthPageAccess("", {
        authenticateSession: vi.fn().mockResolvedValue(null),
      }),
    ).resolves.toEqual({ status: "unauthenticated" });
  });

  it("returns authenticated while preserving the resolved user", async () => {
    await expect(
      resolveAuthPageAccess("cookie=value", {
        authenticateSession: vi.fn().mockResolvedValue(user),
      }),
    ).resolves.toEqual({ status: "authenticated", user });
  });

  it("does not swallow infrastructure failures", async () => {
    const error = new Error("database unavailable");

    await expect(
      resolveAuthPageAccess("cookie=value", {
        authenticateSession: vi.fn().mockRejectedValue(error),
      }),
    ).rejects.toBe(error);
  });
});
