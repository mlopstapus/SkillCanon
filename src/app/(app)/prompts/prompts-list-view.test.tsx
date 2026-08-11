import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { expectNoCriticalOrSeriousAxeViolations } from "@/shared/testing/accessibility";
import { PromptsListView, type PromptListRow } from "./prompts-list-view";

const rows: PromptListRow[] = [
  {
    id: "p1",
    name: "commit-message",
    description: "Generates a commit message",
    isDeprecated: false,
    isOwnedByMe: true,
    projectIds: ["proj-1"],
    projectLabels: ["Support Copilot"],
    ownerLabel: "alice",
    activeVersion: "v2",
    tags: ["git", "conventional"],
    updatedAt: "2026-07-10",
  },
  {
    id: "p2",
    name: "nightly-eval-suite",
    description: "Grades traces",
    isDeprecated: true,
    isOwnedByMe: false,
    projectIds: [],
    projectLabels: [],
    ownerLabel: "carol",
    activeVersion: "v1",
    tags: [],
    updatedAt: "2026-03-14",
  },
];

const baseProps = {
  projectOptions: [{ id: "proj-1", name: "Support Copilot" }],
  searchValue: "",
  onSearchChange: vi.fn(),
  onProjectChange: vi.fn(),
  onOwnerChange: vi.fn(),
  onClearFilters: vi.fn(),
  onNewPrompt: vi.fn(),
};

describe("PromptsListView", () => {
  it("renders every row with name, deprecated badge, project label, owner, version, and tags", () => {
    const html = renderToStaticMarkup(
      <PromptsListView {...baseProps} rows={rows} filters={{ q: "", project: "all", owner: "all" }} />,
    );

    expect(html).toContain("commit-message");
    expect(html).toContain("nightly-eval-suite");
    expect(html).toContain("deprecated");
    expect(html).toContain("Support Copilot");
    expect(html).toContain("alice");
    expect(html).toContain("v2");
    expect(html).toContain("conventional");
  });

  it("shows the 'nothing yet' empty state when there are no rows and no active filters", async () => {
    const html = renderToStaticMarkup(
      <PromptsListView {...baseProps} rows={[]} filters={{ q: "", project: "all", owner: "all" }} />,
    );

    expect(html).toContain("No skills yet");
    expect(html).toContain('role="status"');
    expect(html).toContain('aria-live="polite"');
    expect(html).not.toContain("Clear filters");
    await expectNoCriticalOrSeriousAxeViolations(html);
  });

  it("shows the 'no match' empty state (with a Clear filters action) when filters are active but nothing matches", async () => {
    const html = renderToStaticMarkup(
      <PromptsListView {...baseProps} rows={[]} filters={{ q: "xyz", project: "all", owner: "all" }} />,
    );

    expect(html).toContain("No skills match these filters");
    expect(html).toContain("Clear filters");
    await expectNoCriticalOrSeriousAxeViolations(html);
  });

  it("shows a Clear action in the filter bar only when a filter is active", () => {
    const withFilters = renderToStaticMarkup(
      <PromptsListView {...baseProps} rows={rows} filters={{ q: "git", project: "all", owner: "all" }} />,
    );
    const withoutFilters = renderToStaticMarkup(
      <PromptsListView {...baseProps} rows={rows} filters={{ q: "", project: "all", owner: "all" }} />,
    );

    expect(withFilters).toContain("× Clear");
    expect(withoutFilters).not.toContain("× Clear");
  });
});
