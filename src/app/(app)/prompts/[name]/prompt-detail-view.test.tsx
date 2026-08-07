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
    {
      id: "v2",
      version: "v2",
      createdAt: "2026-07-10",
      tags: ["git"],
      isActive: true,
      kind: "template",
      stepCount: 0,
      contentPreview: "You write terse commits.",
    },
    {
      id: "v1",
      version: "v1",
      createdAt: "2026-06-02",
      tags: [],
      isActive: false,
      kind: "template",
      stepCount: 0,
      contentPreview: "sys v1",
    },
  ],
  kind: "template",
  hasActiveVersion: true,
  isLegacyShape: false,
  files: [
    { id: "f-main", name: "SKILL.md", content: "# Commit messages\nYou write terse commits.", isMain: true },
    { id: "f-example", name: "example.md", content: "An example transcript.", isMain: false },
  ],
  legacySystemTemplate: null,
  legacyUserTemplate: null,
  preview: "You write terse commits.\n\n— pin the model.",
  previewError: null,
  appliedPolicies: [{ label: "Pin the exact model version", type: "prepend" }],
  steps: null,
  chainRuns: null,
  shareState: { users: [], teams: [], projects: [] },
  projectAssignment: [],
  accessibleSkillNames: ["commit-message"],
};

const baseProps = {
  activeTab: "overview" as const,
  onTabChange: vi.fn(),
  onDeprecate: vi.fn(),
  onReactivate: vi.fn(),
  onSetActiveVersion: vi.fn(),
  onOpenVersionHistory: vi.fn(),
  onOpenNewVersion: vi.fn(),
  onOpenShare: vi.fn(),
  onOpenAssignProjects: vi.fn(),
  onFork: vi.fn(),
  chainRunsPage: null,
  onRunsPageChange: vi.fn(),
  runStepsByRunId: {},
  onRequestRunSteps: vi.fn(),
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

  it("renders Overview summary cards (file count, active version, applied-policy count, owner) for a new-shape version (FR-013)", () => {
    const html = renderToStaticMarkup(<PromptDetailView {...baseProps} data={baseData} />);

    expect(html).toContain("Active version");
    expect(html).toContain("Files");
    expect(html).toContain("Applied policies");
    expect(html).toContain("Owner");
    expect(html).toContain("alice");
    expect(html).toContain("SKILL.md");
    expect(html).toContain("example.md");
    expect(html).toContain("required");
  });

  it("renders a Files tab listing the main file (marked required) and supporting files, with a Preview/Plain-text toggle (FR-014/FR-015)", () => {
    const html = renderToStaticMarkup(<PromptDetailView {...baseProps} data={baseData} activeTab="files" />);

    expect(html).toContain("SKILL.md");
    expect(html).toContain("example.md");
    expect(html).toContain("Preview");
    expect(html).toContain("Plain text");
  });

  it("never renders a control to remove the main file from the Files tab (FR-005)", () => {
    const html = renderToStaticMarkup(<PromptDetailView {...baseProps} data={baseData} activeTab="files" />);

    expect(html).not.toMatch(/remove.{0,20}SKILL\.md/i);
  });

  it("renders the Preview tab's resolved content when active", () => {
    const html = renderToStaticMarkup(<PromptDetailView {...baseProps} data={baseData} activeTab="preview" />);

    expect(html).toContain("pin the model");
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

  it("shows an empty-state prompting + New version when the skill has no active version yet", () => {
    const html = renderToStaticMarkup(
      <PromptDetailView
        {...baseProps}
        data={{ ...baseData, hasActiveVersion: false, isLegacyShape: false, files: [], activeVersion: null }}
      />,
    );

    expect(html).toContain("No version published yet");
  });

  describe("legacy-shape version (032-skill-file-format-refactor, FR-019)", () => {
    const legacyData: PromptDetailData = {
      ...baseData,
      isLegacyShape: true,
      files: [],
      legacySystemTemplate: "You are helpful.",
      legacyUserTemplate: "Diff:\n{{ diff }}",
    };

    it("hides the Files tab entirely for a legacy-shape version", () => {
      const html = renderToStaticMarkup(<PromptDetailView {...baseProps} data={legacyData} />);

      expect(html).not.toContain("Files (");
    });

    it("shows the legacy system/user content inline on Overview with a note that it predates file-based skills", () => {
      const html = renderToStaticMarkup(<PromptDetailView {...baseProps} data={legacyData} />);

      expect(html).toContain("You are helpful.");
      expect(html).toContain("Diff:");
      expect(html).toContain("predates file-based skills");
    });
  });

  describe("chain-kind skill", () => {
    const chainData: PromptDetailData = {
      ...baseData,
      kind: "chain",
      files: [],
      appliedPolicies: [],
      steps: [
        { id: "step-1", promptName: "summarize", promptVersionLabel: null, dependsOn: [] },
        { id: "step-2", promptName: "draft-reply", promptVersionLabel: "v2", dependsOn: ["step-1"] },
      ],
      chainRuns: {
        items: [
          { id: "run-1", version: "v1", status: "completed", startedAt: "2026-07-26 14:00" },
          { id: "run-2", version: "v1", status: "failed", startedAt: "2026-07-26 14:03" },
        ],
        page: 1,
        pageSize: 20,
        total: 2,
      },
    };

    it("shows a Steps tab (not Overview/Files/Preview/Applied policies) listing every step in order", () => {
      const html = renderToStaticMarkup(<PromptDetailView {...baseProps} data={chainData} activeTab="steps" />);

      expect(html).toContain("Steps");
      expect(html).toContain("summarize");
      expect(html).toContain("draft-reply");
      expect(html).toContain("v2");
      expect(html).toContain("latest");
      expect(html).not.toContain("Applied policies");
    });

    it("shows a distinct empty state for a chain version with no steps", () => {
      const html = renderToStaticMarkup(
        <PromptDetailView {...baseProps} data={{ ...chainData, steps: [] }} activeTab="steps" />,
      );
      expect(html).toContain("No steps defined.");
    });

    it("lists every run in Run History with its status and version, most recent first as provided", () => {
      const html = renderToStaticMarkup(
        <PromptDetailView {...baseProps} data={chainData} chainRunsPage={chainData.chainRuns} activeTab="runs" />,
      );

      expect(html).toContain("completed");
      expect(html).toContain("failed");
      expect(html).toContain("v1");
    });

    it("shows a distinct empty state when a chain has no runs yet", () => {
      const emptyRuns = { items: [], page: 1, pageSize: 20, total: 0 };
      const html = renderToStaticMarkup(
        <PromptDetailView
          {...baseProps}
          data={{ ...chainData, chainRuns: emptyRuns }}
          chainRunsPage={emptyRuns}
          activeTab="runs"
        />,
      );
      expect(html).toContain("No runs yet");
    });

    it("never renders a control that starts, advances, or abandons a run (FR-009)", () => {
      const html = renderToStaticMarkup(
        <PromptDetailView {...baseProps} data={chainData} chainRunsPage={chainData.chainRuns} activeTab="runs" />,
      );

      expect(html.toLowerCase()).not.toMatch(/start run|advance run|abandon run/);
    });
  });
});
