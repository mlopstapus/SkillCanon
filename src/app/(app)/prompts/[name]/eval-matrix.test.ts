import { describe, expect, it } from "vitest";
import { buildEvalMatrix, type EvalRunView, type EvalVersionInput } from "./eval-matrix";

function run(id: string, model: string, outcomes: boolean[], over: Partial<EvalRunView> = {}): EvalRunView {
  return {
    id,
    status: "succeeded",
    contentDigest: `digest-${id}`,
    models: [model],
    error: null,
    results: outcomes.map((passed, i) => ({ model, caseId: `case-${i + 1}`, passed, scorePct: null, latencyMs: 10, tokens: 5, error: null })),
    ...over,
  };
}

const version = (v: string, runs: EvalRunView[], over: Partial<EvalVersionInput> = {}): EvalVersionInput => ({
  versionId: `id-${v}`,
  version: v,
  isActive: false,
  hasCases: true,
  cases: [],
  runs,
  ...over,
});

describe("buildEvalMatrix", () => {
  it("shows newest version first and flags any drop versus the previous version as a regression", () => {
    const matrix = buildEvalMatrix(
      [version("1", [run("a", "p/m", [true, true, true, true])]), version("2", [run("b", "p/m", [true, true, true, false])])],
      ["p/m"],
    );

    expect(matrix.rows.map((r) => r.version)).toEqual(["2", "1"]);
    expect(matrix.rows[1]?.cells["p/m"]).toMatchObject({ passRate: 100, delta: null, regression: false });
    expect(matrix.rows[0]?.cells["p/m"]).toMatchObject({ passRate: 75, passed: 3, total: 4, delta: -25, regression: true });
  });

  it("marks an improvement without a regression and draws no delta across a different case count", () => {
    const up = buildEvalMatrix(
      [version("1", [run("a", "p/m", [false, true])]), version("2", [run("b", "p/m", [true, true])])],
      ["p/m"],
    );
    expect(up.rows[0]?.cells["p/m"]).toMatchObject({ delta: 50, regression: false });

    const different = buildEvalMatrix(
      [version("1", [run("a", "p/m", [true, true, true])]), version("2", [run("b", "p/m", [true, false])])],
      ["p/m"],
    );
    expect(different.rows[0]?.cells["p/m"]).toMatchObject({ passRate: 50, delta: null, regression: false });
  });

  it("uses the newest finished run per model, shows an active run, and keeps cells for other models separate", () => {
    const matrix = buildEvalMatrix(
      [
        version("1", [
          run("running", "p/m", [], { status: "running", results: [] }),
          run("new", "p/m", [true, false]),
          run("old", "p/m", [false, false]),
          run("other", "q/n", [true, true]),
        ]),
      ],
      ["p/m", "q/n"],
    );

    const row = matrix.rows[0];
    expect(row?.activeRun).toEqual({ id: "running", status: "running" });
    expect(row?.cells["p/m"]).toMatchObject({ passRate: 50, digest: "digest-new" });
    expect(row?.cells["q/n"]).toMatchObject({ passRate: 100 });
    expect(matrix.models).toEqual(["p/m", "q/n"]);
  });

  it("surfaces a failed run's error only when the version has no result at all", () => {
    const matrix = buildEvalMatrix(
      [version("1", [run("bad", "p/m", [], { status: "failed", error: "provider timeout", results: [] })])],
      ["p/m"],
    );
    expect(matrix.rows[0]?.lastError).toBe("provider timeout");
    expect(matrix.rows[0]?.cells).toEqual({});
  });
});
