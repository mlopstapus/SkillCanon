import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
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
});
