import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { NewVersionDrawer } from "./new-version-drawer";

describe("NewVersionDrawer", () => {
  it("renders the next-version banner and pre-fills templates/tags from the active version", () => {
    const html = renderToStaticMarkup(
      <NewVersionDrawer
        promptName="commit-message"
        nextVersionLabel="v3"
        systemTemplate="You write terse commits."
        userTemplate="Diff:\n{{ diff }}"
        tags={["git", "conventional"]}
        onClose={vi.fn()}
        onSubmit={vi.fn().mockResolvedValue({ ok: true })}
      />,
    );

    expect(html).toContain("New version of commit-message");
    expect(html).toContain("v3");
    expect(html).toContain("You write terse commits.");
    expect(html).toContain("git, conventional");
    expect(html).toContain("Set as active version immediately");
    expect(html).toContain("Publish version");
  });
});
