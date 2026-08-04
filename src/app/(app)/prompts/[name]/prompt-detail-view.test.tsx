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
      systemTemplate: "sys v2",
      stepCount: 0,
    },
    {
      id: "v1",
      version: "v1",
      createdAt: "2026-06-02",
      tags: [],
      isActive: false,
      kind: "template",
      systemTemplate: "sys v1",
      stepCount: 0,
    },
  ],
  kind: "template",
  systemTemplate: "You write terse commits.",
  userTemplate: "Diff:\n{{ diff }}",
  inputSchemaRows: [{ name: "diff", type: "string", required: true }],
  preview: { systemMessage: "You write terse commits.\n\n— pin the model.", userMessage: "Diff:\nfix bug" },
  previewError: null,
  appliedPolicies: [{ label: "Pin the exact model version", type: "prepend" }],
  steps: null,
  chainRuns: null,
  shareState: { users: [], teams: [], projects: [] },
  projectAssignment: [],
  accessibleSkillNames: ["commit-message"],
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

  describe("chain-kind skill", () => {
    const chainData: PromptDetailData = {
      ...baseData,
      kind: "chain",
      systemTemplate: null,
      userTemplate: null,
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

    it("shows a Steps tab (not Template/Preview/Applied policies) listing every step in order", () => {
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
