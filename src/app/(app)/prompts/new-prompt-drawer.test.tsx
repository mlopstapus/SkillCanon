import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { NewPromptDrawer } from "./new-prompt-drawer";

describe("NewPromptDrawer", () => {
  it("renders all form fields and the create action", () => {
    const html = renderToStaticMarkup(
      <NewPromptDrawer onClose={vi.fn()} onSubmit={vi.fn().mockResolvedValue({ ok: true })} />,
    );

    expect(html).toContain("New prompt");
    expect(html).toContain("release-notes-gen");
    expect(html).toContain("System template");
    expect(html).toContain("User template");
    expect(html).toContain("Tags");
    expect(html).toContain("Create prompt");
  });
});
