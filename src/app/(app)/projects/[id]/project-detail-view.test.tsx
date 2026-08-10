import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { expectNoCriticalOrSeriousAxeViolations } from "@/shared/testing/accessibility";
import { ProjectDetailView, type ProjectDetailData } from "./project-detail-view";

const baseData: ProjectDetailData = {
  id: "proj-1",
  name: "Eval Harness",
  description: "Prompt evaluation harness.",
  teamLabel: "MLOps",
  leadLabel: "alice",
  memberCount: 1,
  teamCount: 0,
  repoCount: 1,
  promptCount: 1,
  members: [{ userId: "u1", name: "alice", role: "lead" }],
  collaboratorTeams: [],
  addableTeams: [{ id: "t2", name: "Engineering" }],
  addableUsers: [{ id: "u2", name: "bob" }],
  repos: [{ id: "r1", name: "ml-eval-harness", url: "github.com/acme/ml-eval-harness", branch: "main" }],
  requiredPrompts: [{ id: "p1", name: "code-review-strict", description: "Strict review.", activeVersion: "v3", requirement: "required" }],
  optionalPrompts: [],
  availablePrompts: [{ id: "p2", name: "commit-message", description: "Commits.", activeVersion: "v1", requirement: null }],
  metrics: {
    totalInvocations: 42,
    activeSkillCount: 3,
    activeContributorCount: 2,
    coverageLabel: "1/2",
    hasRequiredSkills: true,
    allClear: false,
    gapMembers: [],
    trend: Array.from({ length: 14 }, (_, i) => ({ day: `2026-08-${String(i + 1).padStart(2, "0")}`, countsByPromptId: {} })),
    trendSkills: [{ id: "p1", name: "code-review-strict" }],
    bySkill: [{ promptId: "p1", name: "code-review-strict", requirement: "required", runCount: 12, lastUsedAt: "2026-08-01" }],
    byMember: [{ userId: "u1", name: "alice", runCount: 12, lastActiveAt: "2026-08-01" }],
  },
  objectives: [{ id: "o1", title: "Prefer opus for customer-facing output", description: "Use the strongest model for anything a customer sees." }],
};

const baseProps = {
  onTabChange: vi.fn(),
  onRemoveMember: vi.fn(),
  onRemoveTeam: vi.fn(),
  onRemoveRepo: vi.fn(),
  onSetRequirement: vi.fn(),
  onOpenAddTeam: vi.fn(),
  onOpenAddMember: vi.fn(),
  onOpenAddRepo: vi.fn(),
  onOpenAddObjective: vi.fn(),
  onEditObjective: vi.fn(),
  onRemoveObjective: vi.fn(),
};

describe("ProjectDetailView", () => {
  it("renders the header with team label and lead, and tab counts", () => {
    const html = renderToStaticMarkup(<ProjectDetailView {...baseProps} data={baseData} activeTab="members" />);

    expect(html).toContain("Eval Harness");
    expect(html).toContain("MLOps");
    expect(html).toContain("lead alice");
    expect(html).toContain("Members (1)");
    expect(html).toContain("Prompts (1)");
  });

  it("renders members with a remove action", () => {
    const html = renderToStaticMarkup(<ProjectDetailView {...baseProps} data={baseData} activeTab="members" />);
    expect(html).toContain("alice");
    expect(html).toContain("lead");
  });

  it("renders repositories with branch badge", () => {
    const html = renderToStaticMarkup(<ProjectDetailView {...baseProps} data={baseData} activeTab="repos" />);
    expect(html).toContain("ml-eval-harness");
    expect(html).toContain("main");
  });

  it("renders required/optional/available prompt groups", () => {
    const html = renderToStaticMarkup(<ProjectDetailView {...baseProps} data={baseData} activeTab="prompts" />);
    expect(html).toContain("code-review-strict");
    expect(html).toContain("Make optional");
    expect(html).toContain("commit-message");
    expect(html).toContain("+ Required");
  });

  it("shows the empty-repo state with an Add repository call to action", () => {
    const html = renderToStaticMarkup(
      <ProjectDetailView {...baseProps} data={{ ...baseData, repos: [], repoCount: 0 }} activeTab="repos" />,
    );
    expect(html).toContain("No repositories linked");
    expect(html).toContain("Add repository");
  });

  it("renders the four summary tiles on the Metrics tab", () => {
    const html = renderToStaticMarkup(<ProjectDetailView {...baseProps} data={baseData} activeTab="metrics" />);
    expect(html).toContain("Total invocations");
    expect(html).toContain("42");
    expect(html).toContain("Active skills");
    expect(html).toContain("Active contributors");
    expect(html).toContain("Required-skill coverage");
    expect(html).toContain("1/2");
  });

  it("shows the neutral coverage state when the project has no required skills", () => {
    const html = renderToStaticMarkup(
      <ProjectDetailView
        {...baseProps}
        data={{ ...baseData, metrics: { ...baseData.metrics, coverageLabel: "—" } }}
        activeTab="metrics"
      />,
    );
    expect(html).toContain("—");
  });

  it("renders the gap panel with member name and missing skill names", () => {
    const html = renderToStaticMarkup(
      <ProjectDetailView
        {...baseProps}
        data={{
          ...baseData,
          metrics: {
            ...baseData.metrics,
            gapMembers: [{ userId: "u2", name: "bob", missingSkillNames: ["code-review-strict"] }],
          },
        }}
        activeTab="metrics"
      />,
    );
    expect(html).toContain("Contributors not using required skills");
    expect(html).toContain("bob");
    expect(html).toContain("code-review-strict");
  });

  it("shows the all-clear message when every contributor is current", () => {
    const html = renderToStaticMarkup(
      <ProjectDetailView
        {...baseProps}
        data={{ ...baseData, metrics: { ...baseData.metrics, allClear: true, gapMembers: [] } }}
        activeTab="metrics"
      />,
    );
    expect(html).toContain("Every contributor is current on required skills.");
  });

  it("renders neither the gap panel nor the all-clear message when the project has no required skills (not applicable)", () => {
    const html = renderToStaticMarkup(
      <ProjectDetailView
        {...baseProps}
        data={{
          ...baseData,
          metrics: { ...baseData.metrics, hasRequiredSkills: false, allClear: false, gapMembers: [] },
        }}
        activeTab="metrics"
      />,
    );
    expect(html).not.toContain("Contributors not using required skills");
    expect(html).not.toContain("Every contributor is current on required skills.");
  });

  it("renders the by-skill and by-member tables when populated", () => {
    const html = renderToStaticMarkup(<ProjectDetailView {...baseProps} data={baseData} activeTab="metrics" />);
    expect(html).toContain("Usage by skill");
    expect(html).toContain("code-review-strict");
    expect(html).toContain("12 runs");
    expect(html).toContain("Usage by member");
    expect(html).toContain("alice");
    expect(html).toContain("Invocations, last 14 days");
  });

  it("shows independent empty states for the by-skill and by-member tables", () => {
    const html = renderToStaticMarkup(
      <ProjectDetailView
        {...baseProps}
        data={{ ...baseData, metrics: { ...baseData.metrics, bySkill: [], byMember: [] } }}
        activeTab="metrics"
      />,
    );
    expect(html).toContain("No skills curated for this project yet.");
    expect(html).toContain("No usage recorded for this project yet.");
  });

  it("renders the Governance tab label with a count badge", () => {
    const html = renderToStaticMarkup(<ProjectDetailView {...baseProps} data={baseData} activeTab="governance" />);
    expect(html).toContain("Governance (1)");
  });

  it("renders each local objective's title and description on the Governance tab", () => {
    const html = renderToStaticMarkup(<ProjectDetailView {...baseProps} data={baseData} activeTab="governance" />);
    expect(html).toContain("Prefer opus for customer-facing output");
    expect(html).toContain("Use the strongest model for anything a customer sees.");
  });

  it("shows the empty state on the Governance tab when the project has no local objectives", () => {
    const html = renderToStaticMarkup(
      <ProjectDetailView {...baseProps} data={{ ...baseData, objectives: [] }} activeTab="governance" />,
    );
    expect(html).toContain("No objectives yet");
    expect(html).toContain("New objective");
    expect(html).toContain("Governance (0)");
  });

  it("has no critical or serious axe violations on the Governance tab, populated", async () => {
    const html = renderToStaticMarkup(<ProjectDetailView {...baseProps} data={baseData} activeTab="governance" />);
    await expectNoCriticalOrSeriousAxeViolations(html);
  });

  it("has no critical or serious axe violations on the Governance tab, empty", async () => {
    const html = renderToStaticMarkup(
      <ProjectDetailView {...baseProps} data={{ ...baseData, objectives: [] }} activeTab="governance" />,
    );
    await expectNoCriticalOrSeriousAxeViolations(html);
  });
});
