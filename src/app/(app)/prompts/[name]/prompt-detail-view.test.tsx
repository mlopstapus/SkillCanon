import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { PromptDetailView, type PromptDetailData } from "./prompt-detail-view";

const baseData: PromptDetailData = {
  id: "p1",
  name: "commit-message",
  description: "Generates a commit message",
  isDeprecated: false,
  ownerLabel: "alice",
  projectLabels: ["Support Copilot"],
  activeVersion: "v2",
  versions: [
    { id: "v2", version: "v2", createdAt: "2026-07-10", tags: ["git"], isActive: true, systemTemplate: "sys v2" },
    { id: "v1", version: "v1", createdAt: "2026-06-02", tags: [], isActive: false, systemTemplate: "sys v1" },
  ],
  systemTemplate: "You write terse commits.",
  userTemplate: "Diff:\n{{ diff }}",
  inputSchemaRows: [{ name: "diff", type: "string", required: true }],
  preview: { systemMessage: "You write terse commits.\n\n— pin the model.", userMessage: "Diff:\nfix bug" },
  previewError: null,
  appliedPolicies: [{ label: "Pin the exact model version", type: "prepend" }],
  shareState: { users: [], teams: [], projects: [] },
  projectAssignment: [],
};

const baseProps = {
  activeTab: "template" as const,
  onTabChange: vi.fn(),
  onDeprecate: vi.fn(),
  onReactivate: vi.fn(),
  onSetActiveVersion: vi.fn(),
  onOpenVersionHistory: vi.fn(),
  onOpenNewVersion: vi.fn(),
  onOpenShare: vi.fn(),
  onOpenAssignProjects: vi.fn(),
  onFork: vi.fn(),
};

describe("PromptDetailView", () => {
  it("renders the header, version badge, project label, and Deprecate action for a non-deprecated prompt", () => {
    const html = renderToStaticMarkup(<PromptDetailView {...baseProps} data={baseData} />);

    expect(html).toContain("commit-message");
    expect(html).toContain("v2");
    expect(html).toContain("Support Copilot");
    expect(html).toContain("Deprecate");
    expect(html).not.toContain("Reactivate");
  });

  it("shows the deprecated badge and a Reactivate action when the prompt is deprecated", () => {
    const html = renderToStaticMarkup(
      <PromptDetailView {...baseProps} data={{ ...baseData, isDeprecated: true }} />,
    );

    expect(html).toContain("deprecated");
    expect(html).toContain("Reactivate");
  });

  it("renders the Template tab's system/user templates and input schema", () => {
    const html = renderToStaticMarkup(<PromptDetailView {...baseProps} data={baseData} />);

    expect(html).toContain("You write terse commits.");
    expect(html).toContain("Diff:");
    expect(html).toContain("diff");
    expect(html).toContain("required");
  });

  it("renders the Preview tab's rendered system/user messages when active", () => {
    const html = renderToStaticMarkup(<PromptDetailView {...baseProps} data={baseData} activeTab="preview" />);

    expect(html).toContain("pin the model");
    expect(html).toContain("fix bug");
  });

  it("renders a preview error instead of crashing when expansion failed", () => {
    const html = renderToStaticMarkup(
      <PromptDetailView
        {...baseProps}
        data={{ ...baseData, preview: null, previewError: "Missing required variable." }}
        activeTab="preview"
      />,
    );

    expect(html).toContain("Missing required variable.");
  });

  it("renders the Applied policies tab with enforcement-type badges", () => {
    const html = renderToStaticMarkup(<PromptDetailView {...baseProps} data={baseData} activeTab="policies" />);

    expect(html).toContain("Pin the exact model version");
    expect(html).toContain("prepend");
  });
});
