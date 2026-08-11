import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { expectNoCriticalOrSeriousAxeViolations } from "@/shared/testing/accessibility";
import { NewPromptDrawer } from "./new-prompt-drawer";

const baseProps = {
  onClose: vi.fn(),
  onSubmit: vi.fn().mockResolvedValue({ ok: true }),
  existingNames: ["commit-message"],
  onFetchImportSource: vi.fn(),
  onImportSkills: vi.fn(),
  onScanLocalFolder: vi.fn(),
  onImportLocalSkills: vi.fn(),
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

  it("renders the Blank skill / Import from link / Import from folder mode toggle (013-skill-import-and-external-registries)", () => {
    const html = renderToStaticMarkup(<NewPromptDrawer {...baseProps} />);

    expect(html).toContain("Blank skill");
    expect(html).toContain("Import from link");
    // 013-skill-import-and-external-registries/002 (spec 037-local-folder-skill-upload).
    expect(html).toContain("Import from folder");
  });

  // The drawer's mode panels are conditionally mounted (`mode === "x" ? ... : ...`),
  // so only content in the always-rendered tab bar (asserted above) is reachable
  // via a single renderToStaticMarkup call from the default "blank" mode — the
  // same pre-existing limitation this repo's own conventions document for any
  // conditionally-unmounted tab content. The "Import from link" panel's own body
  // (source input, fetch button, results list) was never asserted for the same
  // reason before this feature; the new "Import from folder" panel's body
  // (drop zone, preview list, malformed/duplicate/failure states) is verified via
  // quickstart.md's live browser validation instead, not a unit test.

  it("has no critical or serious axe violations in its default (Blank skill) rendered state (Constitution Principle VIII)", async () => {
    const html = renderToStaticMarkup(<NewPromptDrawer {...baseProps} />);
    await expectNoCriticalOrSeriousAxeViolations(html);
  });
});
