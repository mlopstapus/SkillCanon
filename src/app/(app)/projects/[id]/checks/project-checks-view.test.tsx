import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ProjectChecksView, type ProjectChecksViewProps } from "./project-checks-view";

const base: ProjectChecksViewProps = {
  projectId: "p",
  projectName: "Docs",
  windowDays: 30,
  hasInstallation: true,
  linkedRepos: ["acme/api"],
  summary: { totalEvaluated: 0, passed: 0, failed: 0, neutral: 0, rate: null },
  checks: [],
};
const render = (over: Partial<ProjectChecksViewProps>) => renderToStaticMarkup(<ProjectChecksView {...base} {...over} />);
const check = (status: "pass" | "fail" | "neutral", over = {}) => ({
  id: status,
  repo: "acme/api",
  prNumber: 3,
  status,
  headSha: "abc",
  evaluatedAt: "2026-10-30 12:00 UTC",
  satisfied: ["a"],
  missing: status === "fail" ? ["b"] : [],
  error: null,
  ...over,
});

describe("ProjectChecksView", () => {
  it("shows the install call to action when nothing is installed", () => {
    const html = render({ hasInstallation: false, linkedRepos: [] });
    expect(html).toContain("not installed on GitHub");
    expect(html).toContain("Install SkillCanon on GitHub");
  });

  it("shows no-repos, no-PRs, and nothing-in-window empty states", () => {
    expect(render({ linkedRepos: [] })).toContain("No repositories linked to this project");
    expect(render({})).toContain("No pull requests have been evaluated yet");
    const old = render({ checks: [check("pass")] });
    expect(old).toContain("No pull requests were evaluated in the last 30 days");
  });

  it("shows the rate, excluding neutral, and per-PR ran/missing/error text", () => {
    const html = render({
      summary: { totalEvaluated: 5, passed: 3, failed: 1, neutral: 1, rate: 0.75 },
      checks: [check("pass"), check("fail", { prNumber: 4 }), check("neutral", { prNumber: 5, error: "GitHub returned an unexpected response (HTTP 500)." })],
    });
    expect(html).toContain("75%");
    expect(html).toContain("3 of 4 evaluated");
    expect(html).toContain("1 could not be evaluated and are not counted");
    expect(html).toContain("missing: b");
    expect(html).toContain("HTTP 500");
    expect(html).toContain("never blocks a merge");
  });

  it("says there is no rate yet when every check errored", () => {
    expect(render({ summary: { totalEvaluated: 2, passed: 0, failed: 0, neutral: 2, rate: null }, checks: [check("neutral")] })).toContain("no rate yet");
  });
});
