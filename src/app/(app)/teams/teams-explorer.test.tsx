import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { AppSessionUser, Team, UserAccountSummary } from "@/bcs/identity-access";
import { TeamsExplorer } from "./teams-explorer";

const now = new Date("2026-01-01T00:00:00Z");

function makeTeam(overrides: Partial<Team> & Pick<Team, "id" | "name" | "slug">): Team {
  return {
    organizationId: "org-1",
    description: null,
    ownerId: null,
    parentTeamId: null,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

const root = makeTeam({ id: "team-root", name: "Acme Corp", slug: "org" });
const engineering = makeTeam({
  id: "team-eng",
  name: "Engineering",
  slug: "engineering",
  parentTeamId: root.id,
});
const platform = makeTeam({
  id: "team-platform",
  name: "Platform",
  slug: "platform",
  parentTeamId: engineering.id,
  ownerId: "user-carol",
});

const teams = [root, engineering, platform];

function makeUser(
  overrides: Partial<UserAccountSummary> &
    Pick<UserAccountSummary, "id" | "displayName" | "email" | "teamId">,
): UserAccountSummary {
  return {
    organizationId: "org-1",
    username: overrides.displayName.toLowerCase(),
    role: "member",
    isActive: true,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

const users = [
  makeUser({ id: "user-alice", displayName: "Alice", email: "alice@acme.com", teamId: root.id, role: "admin" }),
  makeUser({ id: "user-carol", displayName: "Carol", email: "carol@acme.com", teamId: platform.id, role: "admin" }),
];

const adminSession: AppSessionUser = {
  id: "user-alice",
  orgId: "org-1",
  teamId: root.id,
  role: "admin",
  email: "alice@acme.com",
  displayName: "Alice",
  teamName: "Acme Corp",
};

const memberSession: AppSessionUser = {
  ...adminSession,
  id: "user-carol",
  role: "member",
  teamId: platform.id,
};

describe("TeamsExplorer", () => {
  it("renders every team in the hierarchy with a member count", () => {
    const markup = renderToStaticMarkup(
      <TeamsExplorer
        currentUser={adminSession}
        teams={teams}
        users={users}
        initialSelectedTeamId={root.id}
      />,
    );

    expect(markup).toContain("Acme Corp");
    expect(markup).toContain("Engineering");
    expect(markup).toContain("Platform");
    expect(markup).toContain("3 total");
  });

  it("shows the full root-to-team breadcrumb for a deeply-nested selected team", () => {
    const markup = renderToStaticMarkup(
      <TeamsExplorer
        currentUser={adminSession}
        teams={teams}
        users={users}
        initialSelectedTeamId={platform.id}
      />,
    );

    expect(markup).toContain("data-testid=\"team-breadcrumb\"");
    expect(markup).toContain("Acme Corp");
    expect(markup).toContain("Engineering");
    expect(markup).toContain("Platform");
  });

  it("lists the selected team's members (all tab panels render in markup; visibility is CSS-toggled, not unmounted)", () => {
    const markup = renderToStaticMarkup(
      <TeamsExplorer
        currentUser={adminSession}
        teams={teams}
        users={users}
        initialSelectedTeamId={platform.id}
      />,
    );

    expect(markup).toContain("Carol");
    expect(markup).toContain("carol@acme.com");
  });

  it("renders an admin-gated, disabled 'New sub-team' CTA in the empty sub-teams state (US2 wires it)", () => {
    const markup = renderToStaticMarkup(
      <TeamsExplorer
        currentUser={adminSession}
        teams={[root]}
        users={[]}
        initialSelectedTeamId={root.id}
      />,
    );

    expect(markup).toContain("No sub-teams under Acme Corp");
    expect(markup).toContain("New sub-team");
    expect(markup).toContain("disabled");
  });

  it("does not show the admin-only 'New sub-team' CTA to a non-admin", () => {
    const markup = renderToStaticMarkup(
      <TeamsExplorer
        currentUser={memberSession}
        teams={[root]}
        users={[]}
        initialSelectedTeamId={root.id}
      />,
    );

    expect(markup).toContain("No sub-teams under Acme Corp");
    expect(markup).not.toContain("New sub-team");
  });
});
