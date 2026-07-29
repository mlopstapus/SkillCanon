import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { UnassignedNotice } from "./unassigned-notice";

describe("UnassignedNotice", () => {
  it("explains the restricted state without implying the user is signed out", () => {
    const markup = renderToStaticMarkup(<UnassignedNotice />);

    expect(markup).toContain("not on a team");
    expect(markup).toContain("signed in");
    expect(markup).toContain("admin");
  });
});
