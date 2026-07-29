import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { RemoveMemberConfirm } from "./remove-member-confirm";

const noop = () => {};

describe("RemoveMemberConfirm", () => {
  it("names the target and explains the unassign-not-deactivate outcome, matching spec.md's Members drawer copy", () => {
    const markup = renderToStaticMarkup(
      <RemoveMemberConfirm
        targetUserId="user-1"
        targetDisplayName="Jamie Rivera"
        onClose={noop}
        onSuccess={noop}
      />,
    );

    expect(markup).toContain("Jamie Rivera");
    expect(markup).toContain("unassigned");
    expect(markup).toContain("not deactivated");
    expect(markup).toContain("API key");
    expect(markup).toContain("Remove member");
  });
});
