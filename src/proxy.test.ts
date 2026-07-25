import { NextRequest } from "next/server";
import { describe, expect, it, vi } from "vitest";
import type { AppSessionUser } from "@/bcs/identity-access";
import { config, handleProtectedRequest } from "./proxy";

const user: AppSessionUser = {
  id: "user-123",
  orgId: "org-123",
  teamId: "team-123",
  role: "admin",
  email: "jane@example.com",
  displayName: "Jane Doe",
  teamName: "Platform",
};

function dashboardRequest() {
  return new NextRequest("https://example.com/dashboard", {
    headers: { cookie: "session=value" },
  });
}

describe("handleProtectedRequest", () => {
  it("redirects unauthenticated requests before protected rendering", async () => {
    const resolveAccess = vi
      .fn()
      .mockResolvedValue({ status: "unauthenticated" });

    const response = await handleProtectedRequest(
      dashboardRequest(),
      resolveAccess,
    );

    expect(resolveAccess).toHaveBeenCalledWith("session=value");
    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe("https://example.com/login");
    expect(await response.text()).toBe("");
  });

  it("rewrites entitlement denial to a shell-free page", async () => {
    const response = await handleProtectedRequest(
      dashboardRequest(),
      vi.fn().mockResolvedValue({ status: "entitlement-denied", user }),
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("x-middleware-rewrite")).toBe(
      "https://example.com/access-unavailable",
    );
    expect(await response.text()).toBe("");
  });

  it("allows entitled requests to continue without a response body", async () => {
    const response = await handleProtectedRequest(
      dashboardRequest(),
      vi.fn().mockResolvedValue({ status: "allowed", user }),
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("x-middleware-next")).toBe("1");
    expect(await response.text()).toBe("");
  });
});

describe("config.matcher", () => {
  it("never gates the public root route", () => {
    // The marketing landing page at "/" (014-marketing-landing-page) must never
    // require auth. Guard against a future edit accidentally adding it here.
    expect(config.matcher).not.toContain("/");
    expect(
      config.matcher.some((pattern) => pattern === "/:path*" || pattern === "/*"),
    ).toBe(false);
  });
});
