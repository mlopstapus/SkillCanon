import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { Team, UserAccountSummary } from "@/bcs/identity-access";
import { AddMemberDrawer } from "./add-member-drawer";

const now = new Date("2026-01-01T00:00:00Z");

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

const platform: Team = {
  id: "team-platform",
  organizationId: "org-1",
  name: "Platform",
  slug: "platform",
  description: null,
  ownerId: null,
  parentTeamId: null,
  createdAt: now,
  updatedAt: now,
};

const noop = () => {};

describe("AddMemberDrawer", () => {
  it("lists candidates with a search field, showing unassigned people plainly", () => {
    const bob = makeUser({ id: "user-bob", displayName: "Bob", email: "bob@acme.com", teamId: null });

    const markup = renderToStaticMarkup(
      <AddMemberDrawer
        teamId="team-eng"
        teamName="Engineering"
        candidateUsers={[bob]}
        teamsById={new Map([[platform.id, platform]])}
        onClose={noop}
        onSuccess={noop}
      />,
    );

    expect(markup).toContain("Add member");
    expect(markup).toContain("Engineering");
    expect(markup).toContain("Search people");
    expect(markup).toContain("Bob");
    expect(markup).toContain("unassigned");
    expect(markup).toContain(">Add<");
  });

  it("shows a candidate's current team and offers to move them, not just add them", () => {
    const carol = makeUser({
      id: "user-carol",
      displayName: "Carol",
      email: "carol@acme.com",
      teamId: platform.id,
    });

    const markup = renderToStaticMarkup(
      <AddMemberDrawer
        teamId="team-eng"
        teamName="Engineering"
        candidateUsers={[carol]}
        teamsById={new Map([[platform.id, platform]])}
        onClose={noop}
        onSuccess={noop}
      />,
    );

    expect(markup).toContain("on Platform");
    expect(markup).toContain("Move here");
  });

  it("shows an empty state when every org user is already on this team", () => {
    const markup = renderToStaticMarkup(
      <AddMemberDrawer
        teamId="team-eng"
        teamName="Engineering"
        candidateUsers={[]}
        teamsById={new Map()}
        onClose={noop}
        onSuccess={noop}
      />,
    );

    expect(markup).toContain("Everyone in the org is already on this team.");
  });
});
