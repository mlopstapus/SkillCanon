import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { Team, UserAccountSummary } from "@/bcs/identity-access";
import { UnassignedUsersPanel } from "./unassigned-users-panel";

const now = new Date("2026-01-01T00:00:00Z");

const team: Team = {
  id: "team-1",
  organizationId: "org-1",
  name: "Platform",
  slug: "platform",
  description: null,
  ownerId: null,
  parentTeamId: null,
  createdAt: now,
  updatedAt: now,
};

const unassignedUser: UserAccountSummary = {
  id: "user-1",
  organizationId: "org-1",
  teamId: null,
  username: "jrivera",
  displayName: "Jamie Rivera",
  email: "jamie@example.com",
  role: "member",
  isActive: true,
  createdAt: now,
  updatedAt: now,
};

const noop = () => {};

describe("UnassignedUsersPanel", () => {
  it("shows the empty state when there are no unassigned users", () => {
    const markup = renderToStaticMarkup(
      <UnassignedUsersPanel users={[]} teams={[team]} onAssigned={noop} />,
    );

    expect(markup).toContain("No unassigned users");
  });

  it("lists each unassigned user with a team-assign control", () => {
    const markup = renderToStaticMarkup(
      <UnassignedUsersPanel users={[unassignedUser]} teams={[team]} onAssigned={noop} />,
    );

    expect(markup).toContain("Jamie Rivera");
    expect(markup).toContain("jamie@example.com");
    expect(markup).toContain("Platform");
    expect(markup).toContain("Assign");
  });
});
