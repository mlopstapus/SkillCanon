import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { Team } from "@/bcs/identity-access";
import { TeamFormDrawer } from "./team-form-drawer";

const now = new Date("2026-01-01T00:00:00Z");

const engineering: Team = {
  id: "team-eng",
  organizationId: "org-1",
  name: "Engineering",
  slug: "engineering",
  description: "All engineering",
  ownerId: null,
  parentTeamId: null,
  createdAt: now,
  updatedAt: now,
};

const noop = () => {};

describe("TeamFormDrawer", () => {
  it("shows the create-team title and fields for mode=new", () => {
    const markup = renderToStaticMarkup(
      <TeamFormDrawer
        mode="new"
        contextTeam={null}
        teams={[engineering]}
        users={[]}
        onClose={noop}
        onSuccess={noop}
      />,
    );

    expect(markup).toContain("New team");
    expect(markup).toContain("Create team");
    expect(markup).not.toContain("Parent team");
  });

  it("prefills name/slug/description for mode=edit and shows the parent select", () => {
    const markup = renderToStaticMarkup(
      <TeamFormDrawer
        mode="edit"
        contextTeam={engineering}
        teams={[engineering]}
        users={[]}
        onClose={noop}
        onSuccess={noop}
      />,
    );

    expect(markup).toContain("Edit team");
    expect(markup).toContain("Save changes");
    expect(markup).toContain('value="Engineering"');
    expect(markup).toContain("Parent team");
  });

  it("shows the insert-above explanatory banner for mode=insert", () => {
    const markup = renderToStaticMarkup(
      <TeamFormDrawer
        mode="insert"
        contextTeam={engineering}
        teams={[engineering]}
        users={[]}
        onClose={noop}
        onSuccess={noop}
      />,
    );

    expect(markup).toContain("Insert team above");
    expect(markup).toContain("slots in between");
    expect(markup).toContain("Engineering");
  });

  it("shows the new-sub-team title for mode=sub", () => {
    const markup = renderToStaticMarkup(
      <TeamFormDrawer
        mode="sub"
        contextTeam={engineering}
        teams={[engineering]}
        users={[]}
        onClose={noop}
        onSuccess={noop}
      />,
    );

    expect(markup).toContain("New sub-team");
  });
});
