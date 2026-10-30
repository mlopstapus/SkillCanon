"use client";

import { useEffect, useState } from "react";
import { Badge } from "@/shared/ui";
import type { EvalCell, EvalMatrix, EvalMatrixRow } from "./eval-matrix";

export interface EvalsTabData {
  /** The org has opted in to evals. */
  enabled: boolean;
  /** Models in the provider pool; empty means evals are not configured on this instance. */
  poolModels: string[];
  matrix: EvalMatrix;
}

export type StartEvalRunResult = { ok: true } | { ok: false; error: string };

export interface EvalsPanelProps {
  evals: EvalsTabData;
  onStartRun: (version: string, models: string[]) => Promise<StartEvalRunResult>;
  onRefresh: () => void;
}

const POLL_MS = 4000;

function CaseDetails({ row, cell }: { row: EvalMatrixRow; cell: EvalCell }) {
  const inputById = new Map(row.cases.map((c) => [c.id, c.input]));
  return (
    <div className="mt-3 rounded-card border border-border-2 bg-surface p-3.5" role="region" aria-label={`Cases for ${row.version} on ${cell.model}`}>
      <p className="font-mono text-[11px] text-faint">
        {row.version} · {cell.model} · digest {cell.digest.slice(0, 12)}
      </p>
      <ul className="mt-2 space-y-2">
        {cell.results.map((result) => (
          <li key={result.caseId} className="text-[12.5px] text-dim">
            <div className="flex items-center gap-2">
              <Badge variant={result.error ? "red" : result.passed ? "green" : "red"}>
                {result.error ? "error" : result.passed ? "pass" : "fail"}
              </Badge>
              <span className="font-mono text-text">{result.caseId}</span>
              {result.scorePct !== null ? <span className="font-mono text-[11px] text-faint">score {result.scorePct}</span> : null}
              <span className="ml-auto font-mono text-[11px] text-faint">
                {result.latencyMs ?? "–"} ms · {result.tokens ?? "–"} tokens
              </span>
            </div>
            {inputById.get(result.caseId) ? <p className="mt-1 pl-1 text-[12px] text-faint">Input: {inputById.get(result.caseId)}</p> : null}
            {result.error ? <p className="mt-1 pl-1 text-[12px] text-red">{result.error}</p> : null}
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * The skill page's Evals tab (017/004): a version × model matrix of pass rate
 * with regressions highlighted, a per-case drill-down, and a control to start
 * a run from the provider pool. Refreshes itself while a run is queued/running.
 */
export function EvalsPanel({ evals, onStartRun, onRefresh }: EvalsPanelProps) {
  const [selected, setSelected] = useState<{ versionId: string; model: string } | null>(null);
  const [picking, setPicking] = useState<string | null>(null);
  const [chosen, setChosen] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const anyActive = evals.matrix.rows.some((r) => r.activeRun);
  useEffect(() => {
    if (!anyActive) return;
    const timer = setInterval(onRefresh, POLL_MS);
    return () => clearInterval(timer);
  }, [anyActive, onRefresh]);

  if (evals.poolModels.length === 0) {
    return <p className="text-[13px] text-dim">Evals are not configured on this instance: no model provider has been added.</p>;
  }
  if (!evals.enabled) {
    return <p className="text-[13px] text-dim">Evals are off for your organization. An admin has to opt in before runs can start.</p>;
  }
  const { rows, models } = evals.matrix;
  if (!rows.some((r) => r.hasCases)) {
    return (
      <p className="text-[13px] text-dim">
        No version of this skill has eval cases yet. Add an <code className="font-mono">evals/cases.yaml</code> file to a version, with an input and
        either assertions or a rubric for each case, then run it from here.
      </p>
    );
  }

  async function start(version: string) {
    setBusy(true);
    setError(null);
    const result = await onStartRun(version, chosen);
    setBusy(false);
    if (result.ok) {
      setPicking(null);
      onRefresh();
    } else {
      setError(result.error);
    }
  }

  const selectedRow = rows.find((r) => r.versionId === selected?.versionId);
  const selectedCell = selectedRow && selected ? selectedRow.cells[selected.model] : undefined;

  return (
    <div>
      {error ? (
        <p role="alert" className="mb-2 text-[12px] text-red">
          {error}
        </p>
      ) : null}
      <table className="w-full border-collapse text-left text-[12.5px]">
        <thead>
          <tr className="text-faint">
            <th className="py-2 pr-3 font-mono text-[11px] font-medium uppercase">Version</th>
            {models.map((model) => (
              <th key={model} className="py-2 pr-3 font-mono text-[11px] font-medium">
                {model}
              </th>
            ))}
            <th className="py-2" />
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.versionId} className="border-t border-border">
              <td className="py-2 pr-3 font-mono text-text">
                {row.version}
                {row.isActive ? <span className="ml-1.5 text-[11px] text-a">active</span> : null}
              </td>
              {models.map((model) => {
                const cell = row.cells[model];
                return (
                  <td key={model} className="py-2 pr-3">
                    {cell ? (
                      <button
                        type="button"
                        onClick={() => setSelected({ versionId: row.versionId, model })}
                        aria-label={`${row.version} on ${model}: ${cell.passRate}% passing`}
                        className={cell.regression ? "font-mono text-red" : "font-mono text-text"}
                      >
                        {cell.passRate}% <span className="text-faint">({cell.passed}/{cell.total})</span>
                        {cell.delta !== null && cell.delta !== 0 ? (
                          <span className={cell.regression ? "ml-1 text-red" : "ml-1 text-green"}>
                            {cell.regression ? "▼" : "▲"} {Math.abs(cell.delta)}
                          </span>
                        ) : null}
                      </button>
                    ) : (
                      <span className="text-faint">–</span>
                    )}
                  </td>
                );
              })}
              <td className="py-2 text-right">
                {row.activeRun ? (
                  <span className="font-mono text-[11px] text-dim">{row.activeRun.status === "queued" ? "Queued…" : "Running…"}</span>
                ) : row.hasCases ? (
                  <button
                    type="button"
                    onClick={() => {
                      setPicking(picking === row.versionId ? null : row.versionId);
                      setChosen(evals.poolModels.slice(0, 1));
                    }}
                    className="rounded-control border border-border px-2 py-1 text-[11px] text-dim hover:text-text"
                  >
                    Run evals
                  </button>
                ) : (
                  <span className="text-[11px] text-faint">No cases</span>
                )}
                {row.lastError ? <p className="mt-1 text-[11px] text-red">Last run failed: {row.lastError}</p> : null}
                {picking === row.versionId ? (
                  <div className="mt-2 rounded-control border border-border p-2 text-left">
                    {evals.poolModels.map((model) => (
                      <label key={model} className="flex items-center gap-2 text-[12px] text-dim">
                        <input
                          type="checkbox"
                          checked={chosen.includes(model)}
                          onChange={(e) => setChosen(e.target.checked ? [...chosen, model] : chosen.filter((m) => m !== model))}
                        />
                        {model}
                      </label>
                    ))}
                    <button
                      type="button"
                      disabled={busy || chosen.length === 0}
                      onClick={() => void start(row.version)}
                      className="mt-2 rounded-control border border-border px-2 py-1 text-[11px] text-text disabled:opacity-50"
                    >
                      {busy ? "Starting…" : "Start run"}
                    </button>
                  </div>
                ) : null}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {selectedRow && selectedCell ? <CaseDetails row={selectedRow} cell={selectedCell} /> : null}
    </div>
  );
}
