import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { AppSessionUser, Team, UserAccountSummary } from "@/bcs/identity-access";
import { TeamsExplorerView } from "./teams-explorer";

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
// Sorts alphabetically between "Engineering" and "Platform" but is an
// unrelated root-level sibling — proves the sidebar orders by tree
// structure, not a flat alphabetical sort across the whole org (a real bug
// caught via manual browser verification, not by the original two-team
// fixture below).
const marketing = makeTeam({ id: "team-marketing", name: "Marketing", slug: "marketing" });

const teams = [root, engineering, platform];
const teamsWithSibling = [root, engineering, platform, marketing];

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

const noop = () => {};

describe("TeamsExplorer", () => {
  it("renders every team in the hierarchy with a member count", () => {
    const markup = renderToStaticMarkup(
      <TeamsExplorerView
        currentUser={adminSession}
        teams={teams}
        users={users}
        initialSelectedTeamId={root.id}
      refresh={noop}
      />,
    );

    expect(markup).toContain("Acme Corp");
    expect(markup).toContain("Engineering");
    expect(markup).toContain("Platform");
    expect(markup).toContain("3 total");
  });

  it("shows the full root-to-team breadcrumb for a deeply-nested selected team", () => {
    const markup = renderToStaticMarkup(
      <TeamsExplorerView
        currentUser={adminSession}
        teams={teams}
        users={users}
        initialSelectedTeamId={platform.id}
      refresh={noop}
      />,
    );

    expect(markup).toContain("data-testid=\"team-breadcrumb\"");
    expect(markup).toContain("Acme Corp");
    expect(markup).toContain("Engineering");
    expect(markup).toContain("Platform");
  });

  it("lists the selected team's members (all tab panels render in markup; visibility is CSS-toggled, not unmounted)", () => {
    const markup = renderToStaticMarkup(
      <TeamsExplorerView
        currentUser={adminSession}
        teams={teams}
        users={users}
        initialSelectedTeamId={platform.id}
      refresh={noop}
      />,
    );

    expect(markup).toContain("Carol");
    expect(markup).toContain("carol@acme.com");
  });

  it("renders an admin-gated 'New sub-team' CTA in the empty sub-teams state", () => {
    const markup = renderToStaticMarkup(
      <TeamsExplorerView
        currentUser={adminSession}
        teams={[root]}
        users={[]}
        initialSelectedTeamId={root.id}
      refresh={noop}
      />,
    );

    expect(markup).toContain("No sub-teams under Acme Corp");
    expect(markup).toContain("New sub-team");
  });

  it("does not show the admin-only 'New sub-team' CTA to a non-admin", () => {
    const markup = renderToStaticMarkup(
      <TeamsExplorerView
        currentUser={memberSession}
        teams={[root]}
        users={[]}
        initialSelectedTeamId={root.id}
      refresh={noop}
      />,
    );

    expect(markup).toContain("No sub-teams under Acme Corp");
    expect(markup).not.toContain("New sub-team");
  });

  it("orders the sidebar by tree structure (parent, then its children, then the next sibling) — not a flat alphabetical sort", () => {
    const markup = renderToStaticMarkup(
      <TeamsExplorerView
        currentUser={adminSession}
        teams={teamsWithSibling}
        users={users}
        initialSelectedTeamId={root.id}
      refresh={noop}
      />,
    );

    const nameIndex = (name: string) => markup.indexOf(`>${name}<`);
    const rootIdx = nameIndex("Acme Corp");
    const engIdx = nameIndex("Engineering");
    const platformIdx = nameIndex("Platform");
    const marketingIdx = nameIndex("Marketing");

    expect(rootIdx).toBeLessThan(engIdx);
    // Engineering's own child (Platform) must appear before the next
    // root-level sibling (Marketing), even though "Marketing" sorts
    // alphabetically before "Platform".
    expect(engIdx).toBeLessThan(platformIdx);
    expect(platformIdx).toBeLessThan(marketingIdx);
  });
});
