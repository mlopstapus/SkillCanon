import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { InviteMemberDrawer } from "./invite-member-drawer";

const noop = () => {};

describe("InviteMemberDrawer", () => {
  it("shows the target team name and email/role fields", () => {
    const markup = renderToStaticMarkup(
      <InviteMemberDrawer
        teamId="team-1"
        teamName="Platform"
        onClose={noop}
        onSuccess={noop}
      />,
    );

    expect(markup).toContain("Invite member");
    expect(markup).toContain("Platform");
    expect(markup).toContain("Email");
    expect(markup).toContain("Role");
    expect(markup).toContain("Send invite");
  });
});
