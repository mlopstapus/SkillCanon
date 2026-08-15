import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { ShareDrawer } from "./share-drawer";

const shareState = {
  users: [{ id: "u1", name: "bob", granted: true, subscriptionId: "sub-1" }],
  teams: [{ id: "t1", name: "Engineering", granted: false, subscriptionId: null }],
  projects: [{ id: "p1", name: "Support Copilot", granted: true, subscriptionId: "sub-2" }],
};

describe("ShareDrawer", () => {
  it("renders People/Teams/Projects sections with Grant/Revoke reflecting current state", () => {
    const html = renderToStaticMarkup(
      <ShareDrawer
        promptName="commit-message"
        shareState={shareState}
        onToggleUser={vi.fn()}
        onToggleTeam={vi.fn()}
        onToggleProject={vi.fn()}
        onClose={vi.fn()}
      />,
    );

    expect(html).toContain("Share commit-message");
    expect(html).toContain("bob");
    expect(html).toContain("Revoke");
    expect(html).toContain("Engineering");
    expect(html).toContain("Grant");
    expect(html).toContain("Support Copilot");
  });

  it("shows the updated subscribe/copy banner copy (038-skill-share-consolidation)", () => {
    const html = renderToStaticMarkup(
      <ShareDrawer
        promptName="commit-message"
        shareState={shareState}
        onToggleUser={vi.fn()}
        onToggleTeam={vi.fn()}
        onToggleProject={vi.fn()}
        onClose={vi.fn()}
      />,
    );

    expect(html).toContain(
      "Members of a shared team can subscribe to get live updates as new versions publish, or make a copy they own and edit independently. Only you can edit the original.",
    );
  });
});
