"use client";

import { useState, useTransition } from "react";
import { summarizeObjectivesAction } from "./actions";

export interface ObjectiveSummaryViewProps {
  summary: string | null;
  note: string | null;
  error: string | null;
  pending: boolean;
  onSummarizeTeam: () => void;
  onSummarizeOrg: () => void;
}

export function ObjectiveSummaryView({ summary, note, error, pending, onSummarizeTeam, onSummarizeOrg }: ObjectiveSummaryViewProps) {
  return (
    <section aria-label="Objective summary" className="mb-4 rounded-card border border-border-2 bg-surface p-4">
      <div className="flex items-center gap-2">
        <h2 className="text-[13px] font-medium text-text">AI summary</h2>
        <span className="ml-auto flex gap-1.5">
          <button type="button" onClick={onSummarizeTeam} disabled={pending} className="rounded-control border border-border px-2 py-1 text-[11px] text-dim hover:text-text disabled:opacity-50">
            Summarize this team
          </button>
          <button type="button" onClick={onSummarizeOrg} disabled={pending} className="rounded-control border border-border px-2 py-1 text-[11px] text-dim hover:text-text disabled:opacity-50">
            Summarize organization
          </button>
        </span>
      </div>
      {pending ? <p className="mt-2 text-[12px] text-dim">Summarizing…</p> : null}
      {summary ? <p className="mt-2 whitespace-pre-wrap text-[12.5px] leading-[1.5] text-dim">{summary}</p> : null}
      {note ? <p className="mt-1 text-[11px] text-faint">{note}</p> : null}
      {error ? (
        <p role="alert" className="mt-2 text-[12px] text-red">
          {error}
        </p>
      ) : null}
    </section>
  );
}

export function ObjectiveSummary({ teamId }: { teamId: string }) {
  const [summary, setSummary] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function run(scope: Parameters<typeof summarizeObjectivesAction>[0]) {
    setError(null);
    startTransition(async () => {
      const result = await summarizeObjectivesAction(scope);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setSummary(result.summary);
      setNote(`${result.objectiveCount} objective${result.objectiveCount === 1 ? "" : "s"}${result.cached ? " · unchanged since the last summary" : ""}`);
    });
  }

  return (
    <ObjectiveSummaryView
      summary={summary}
      note={note}
      error={error}
      pending={pending}
      onSummarizeTeam={() => run({ kind: "team", teamId })}
      onSummarizeOrg={() => run({ kind: "org" })}
    />
  );
}
