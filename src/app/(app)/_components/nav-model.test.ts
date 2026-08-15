import { describe, expect, it } from "vitest";
import { getActiveNavKey, getNavigation } from "./nav-model";

describe("getNavigation", () => {
  it("builds the two-section navigation with every real destination", () => {
    expect(getNavigation("team-123")).toEqual([
      {
        label: "Workspace",
        items: [
          { key: "overview", label: "Overview", href: "/dashboard" },
          { key: "prompts", label: "Skills", href: "/prompts" },
          { key: "teams", label: "Teams", href: "/teams" },
          {
            key: "governance",
            label: "Governance",
            href: "/teams/team-123/policies",
          },
          { key: "projects", label: "Projects", href: "/projects" },
          { key: "metrics", label: "Metrics", href: "/metrics" },
        ],
      },
      {
        label: "Settings",
        items: [
          { key: "apiKeys", label: "API keys", href: "/settings/api-keys" },
          {
            key: "auditLog",
            label: "Audit log",
            href: "/settings/audit-log",
          },
        ],
      },
    ]);
  });
});

describe("getActiveNavKey", () => {
  it.each([
    ["/dashboard", "overview"],
    ["/dashboard/activity", "overview"],
    ["/prompts", "prompts"],
    ["/prompts/prompt-123", "prompts"],
    ["/teams/team-123/policies", "governance"],
    ["/teams/team-123/policies/policy-123", "governance"],
    ["/teams/team-123/objectives", "governance"],
    ["/teams", "teams"],
    ["/teams/team-123/members", "teams"],
    ["/projects/project-123", "projects"],
    ["/metrics/quality", "metrics"],
    ["/settings/api-keys/key-123", "apiKeys"],
    ["/settings/audit-log/event-123", "auditLog"],
  ] as const)("maps %s to %s", (pathname, expected) => {
    expect(getActiveNavKey(pathname)).toBe(expected);
  });

  it("does not match lookalike segments", () => {
    expect(getActiveNavKey("/prompts-x")).toBeNull();
    expect(getActiveNavKey("/settings/api-keys-old")).toBeNull();
  });
});
