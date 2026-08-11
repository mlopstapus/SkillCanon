import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { NewPromptDrawer } from "./new-prompt-drawer";

const baseProps = {
  onClose: vi.fn(),
  onSubmit: vi.fn().mockResolvedValue({ ok: true }),
  existingNames: ["commit-message"],
  onFetchImportSource: vi.fn(),
  onImportSkills: vi.fn(),
  onImported: vi.fn(),
};

describe("NewPromptDrawer", () => {
  it("renders only name/description/tags — no template fields (032-skill-file-format-refactor, FR-018)", () => {
    const html = renderToStaticMarkup(<NewPromptDrawer {...baseProps} />);

    expect(html).toContain("New skill");
    expect(html).toContain("release-notes-gen");
    expect(html).toContain("Description");
    expect(html).toContain("Tags");
    expect(html).toContain("Create skill");
    expect(html).not.toContain("System template");
    expect(html).not.toContain("User template");
  });

  it("renders the Blank skill / Import from link mode toggle (013-skill-import-and-external-registries)", () => {
    const html = renderToStaticMarkup(<NewPromptDrawer {...baseProps} />);

    expect(html).toContain("Blank skill");
    expect(html).toContain("Import from link");
  });
});
