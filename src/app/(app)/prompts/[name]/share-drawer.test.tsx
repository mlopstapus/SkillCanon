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
});
