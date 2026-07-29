import { describe, expect, it } from "vitest";
import type { AppSessionUser } from "@/bcs/identity-access";
import { canAccessAuditLog } from "./access";

function makeUser(overrides: Partial<AppSessionUser> = {}): AppSessionUser {
  return {
    id: "user-1",
    orgId: "org-1",
    teamId: "team-1",
    teamName: "Root",
    role: "member",
    email: "user@example.com",
    displayName: "Test User",
    ...overrides,
  };
}

describe("canAccessAuditLog", () => {
  it("allows an admin", () => {
    expect(canAccessAuditLog(makeUser({ role: "admin" }))).toBe(true);
  });

  it("denies a member", () => {
    expect(canAccessAuditLog(makeUser({ role: "member" }))).toBe(false);
  });
});
