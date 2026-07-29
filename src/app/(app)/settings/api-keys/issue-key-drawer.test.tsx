import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { IssueKeyDrawer } from "./issue-key-drawer";

const noop = () => {};

describe("IssueKeyDrawer", () => {
  it("enables every scope for an admin", () => {
    const markup = renderToStaticMarkup(
      <IssueKeyDrawer role="admin" onClose={noop} onIssued={noop} />,
    );

    expect(markup).toContain("prompts:read");
    expect(markup).toContain("prompts:write");
    expect(markup).toContain("workflows:run");
    expect(markup).not.toContain("admin only");
  });

  it("shows write/run scopes present but disabled with an explanation for a member", () => {
    const markup = renderToStaticMarkup(
      <IssueKeyDrawer role="member" onClose={noop} onIssued={noop} />,
    );

    expect(markup).toContain("prompts:write");
    expect(markup).toContain("workflows:run");
    // Exactly the two non-read scopes are labeled "admin only" — the read
    // scope stays fully enabled (unlabeled).
    expect(markup.match(/admin only/g)).toHaveLength(2);
  });
});
