import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { buildEvalMatrix, type EvalRunView } from "./eval-matrix";
import { EvalsPanel, type EvalsTabData } from "./evals-panel";

const noop = vi.fn();
const render = (evals: EvalsTabData) =>
  renderToStaticMarkup(<EvalsPanel evals={evals} onStartRun={async () => ({ ok: true })} onRefresh={noop} />);

const run = (id: string, outcomes: boolean[]): EvalRunView => ({
  id,
  status: "succeeded",
  contentDigest: id,
  models: ["p/m"],
  error: null,
  results: outcomes.map((passed, i) => ({ model: "p/m", caseId: `case-${i}`, passed, scorePct: null, latencyMs: 5, tokens: 1, error: null })),
});

describe("EvalsPanel", () => {
  const version = (v: string, runs: EvalRunView[], hasCases = true) => ({
    versionId: v,
    version: v,
    isActive: v === "2",
    hasCases,
    cases: [],
    runs,
  });

  it("says evals are not configured, with no run control, when the pool is empty", () => {
    const html = render({ enabled: true, poolModels: [], matrix: buildEvalMatrix([], []) });
    expect(html).toContain("not configured");
    expect(html).not.toContain("Run evals");
  });

  it("says evals are off when the organization has not opted in", () => {
    const html = render({ enabled: false, poolModels: ["p/m"], matrix: buildEvalMatrix([], ["p/m"]) });
    expect(html).toContain("off for your organization");
    expect(html).not.toContain("Run evals");
  });

  it("explains how to add cases when no version has any", () => {
    const html = render({ enabled: true, poolModels: ["p/m"], matrix: buildEvalMatrix([version("1", [], false)], ["p/m"]) });
    expect(html).toContain("evals/cases.yaml");
    expect(html).not.toContain("<table");
  });

  it("renders both versions with the regression highlighted, and a run control", () => {
    const matrix = buildEvalMatrix([version("1", [run("a", [true, true])]), version("2", [run("b", [true, false])])], ["p/m"]);
    const html = render({ enabled: true, poolModels: ["p/m"], matrix });

    expect(html).toContain('aria-label="2 on p/m: 50% passing"');
    expect(html).toContain('aria-label="1 on p/m: 100% passing"');
    expect(html).toContain("▼ 50");
    expect(html).toContain("text-red");
    expect(html).toContain("Run evals");
  });

  it("shows a running run instead of the run control", () => {
    const running: EvalRunView = { id: "r", status: "running", contentDigest: "r", models: ["p/m"], error: null, results: [] };
    const html = render({
      enabled: true,
      poolModels: ["p/m"],
      matrix: buildEvalMatrix([version("1", [running])], ["p/m"]),
    });
    expect(html).toContain("Running…");
  });
});
