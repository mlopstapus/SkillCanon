"use client";

import { useState } from "react";
import { Badge } from "@/shared/ui";
import type { DraftActionResult, PromptDetailData } from "./prompt-detail-view";

interface FeedbackPanelProps {
  feedback: PromptDetailData["feedback"];
  onMarkAddressed: (feedbackId: string, versionId: string) => void;
  onRequestDraft: (versionId: string) => Promise<DraftActionResult>;
  onAcceptDraft: (draftId: string) => Promise<DraftActionResult>;
  onDismissDraft: (draftId: string) => Promise<DraftActionResult>;
  onSetThirdPartyOptIn: (enabled: boolean) => Promise<DraftActionResult>;
}

/**
 * The skill page's Feedback tab (016/003): per-version counts, then notes
 * newest first, each linked to its serve. The owner can mark a note
 * addressed by one of the skill's versions.
 */
export function FeedbackPanel({
  feedback,
  onMarkAddressed,
  onRequestDraft,
  onAcceptDraft,
  onDismissDraft,
  onSetThirdPartyOptIn,
}: FeedbackPanelProps) {
  const [chosen, setChosen] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [draftError, setDraftError] = useState<string | null>(null);

  async function run(action: () => Promise<DraftActionResult>) {
    setBusy(true);
    setDraftError(null);
    const result = await action();
    if (!result.ok) setDraftError(result.error);
    setBusy(false);
  }
  const { drafting } = feedback;

  if (feedback.versions.length === 0) {
    return (
      <div role="status" className="rounded-card border border-border py-8 text-center text-[12.5px] text-dim">
        No feedback yet. It appears here when someone rates or comments on a run (skillcanon feedback, sh-feedback,
        or POST /api/feedback).
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="overflow-hidden rounded-card border border-border">
        <div className="grid grid-cols-[1fr_70px_70px_70px] gap-2.5 border-b border-border bg-surface px-4 py-2.5 font-mono text-[10px] tracking-[0.1em] text-faint uppercase">
          <span>Version</span>
          <span>Up</span>
          <span>Down</span>
          <span>Notes</span>
        </div>
        {feedback.versions.map((row) => (
          <div
            key={row.version}
            className="grid grid-cols-[1fr_70px_70px_70px] gap-2.5 border-b border-border px-4 py-2.5 font-mono text-[12px] text-text last:border-b-0"
          >
            <span>{row.version}</span>
            <span>{row.up}</span>
            <span>{row.down}</span>
            <span>{row.notes}</span>
          </div>
        ))}
      </div>

      {feedback.draftableVersions.length > 0 || feedback.drafts.length > 0 ? (
        <section aria-label="Drafted improvements" className="flex flex-col gap-3 rounded-card border border-border p-4">
          <h3 className="font-mono text-[11px] tracking-[0.1em] text-faint uppercase">Drafted improvements</h3>
          {!drafting.configured ? (
            <p role="status" className="text-[12.5px] text-dim">
              No model provider is configured, so drafts are unavailable. An operator sets ANTHROPIC_API_KEY on the server.
            </p>
          ) : !drafting.optedIn ? (
            <div className="flex flex-wrap items-center gap-3 text-[12.5px] text-dim">
              <span>Drafting sends this skill&apos;s text and its notes to the configured model provider.</span>
              {drafting.canChangeOptIn ? (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => run(() => onSetThirdPartyOptIn(true))}
                  className="rounded-control border border-border-2 px-2.5 py-1.5 font-mono text-[12px] text-text disabled:opacity-50"
                >
                  Allow for this organization
                </button>
              ) : (
                <span>Ask an admin to allow it.</span>
              )}
            </div>
          ) : (
            <div className="flex flex-wrap items-center gap-2">
              {feedback.draftableVersions.map((v) => (
                <button
                  key={v.id}
                  type="button"
                  disabled={busy}
                  onClick={() => run(() => onRequestDraft(v.id))}
                  className="rounded-control border border-border-2 px-2.5 py-1.5 font-mono text-[12px] text-text disabled:opacity-50"
                >
                  Draft improvement for {v.version} ({v.openNotes} open)
                </button>
              ))}
            </div>
          )}
          {draftError ? (
            <p role="alert" className="text-[12.5px] text-red">
              {draftError}
            </p>
          ) : null}
          {feedback.drafts.map((draft) => (
            <div key={draft.id} className="rounded-card border border-border">
              <div className="flex flex-wrap items-center gap-2.5 border-b border-border bg-surface px-4 py-2.5 font-mono text-[11px] text-faint">
                <Badge variant={draft.status === "pending" ? "blue" : draft.status === "accepted" ? "green" : "neutral"}>
                  {draft.status}
                </Badge>
                <span>
                  from version {draft.version} · {draft.noteCount} note{draft.noteCount === 1 ? "" : "s"} · {draft.model} ·{" "}
                  {draft.createdAt}
                </span>
                {draft.acceptedVersion ? <span>published as {draft.acceptedVersion}</span> : null}
              </div>
              {draft.rationale ? <p className="px-4 pt-3 text-[12.5px] text-dim">{draft.rationale}</p> : null}
              <pre className="m-3 max-h-80 overflow-auto rounded-control bg-surface p-3 font-mono text-[11.5px]">
                {draft.diff.map((line, i) => (
                  <div
                    key={i}
                    className={line.type === "add" ? "text-green" : line.type === "del" ? "text-red" : "text-dim"}
                  >
                    {line.type === "add" ? "+ " : line.type === "del" ? "- " : "  "}
                    {line.text}
                  </div>
                ))}
              </pre>
              {draft.status === "pending" ? (
                <div className="flex gap-2 px-4 pb-3">
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => run(() => onAcceptDraft(draft.id))}
                    className="rounded-control border border-border-2 px-2.5 py-1.5 font-mono text-[12px] text-text disabled:opacity-50"
                  >
                    Accept as new version
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => run(() => onDismissDraft(draft.id))}
                    className="rounded-control border border-border-2 px-2.5 py-1.5 font-mono text-[12px] text-dim disabled:opacity-50"
                  >
                    Dismiss
                  </button>
                </div>
              ) : null}
            </div>
          ))}
        </section>
      ) : null}

      <div className="flex flex-col gap-3">
        {feedback.notes.map((note) => (
          <div key={note.id} className="rounded-card border border-border px-4 py-3">
            <div className="flex flex-wrap items-center gap-2.5 font-mono text-[11px] text-faint">
              {note.rating ? <Badge variant={note.rating === "up" ? "green" : "red"}>{note.rating}</Badge> : null}
              <span>
                {note.author} · {note.createdAt} · version {note.version}
              </span>
              <a href={`/api/serves/${note.serveId}`} className="text-a hover:text-a-2">
                serve {note.serveId.slice(0, 8)}
              </a>
              {note.addressedInVersion ? <Badge variant="blue">addressed in {note.addressedInVersion}</Badge> : null}
            </div>
            <p className="mt-2 whitespace-pre-wrap text-[13px] text-text">{note.text}</p>
            {feedback.canTriage && !note.addressedInVersion ? (
              <div className="mt-3 flex items-center gap-2">
                <select
                  aria-label="Version that addressed this note"
                  value={chosen[note.id] ?? ""}
                  onChange={(e) => setChosen((prev) => ({ ...prev, [note.id]: e.target.value }))}
                  className="rounded-control border border-border-2 bg-surface px-2 py-1.5 font-mono text-[12px] text-text"
                >
                  <option value="">Addressed in…</option>
                  {feedback.versionOptions.map((option) => (
                    <option key={option.id} value={option.id}>
                      {option.version}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  disabled={!chosen[note.id]}
                  onClick={() => onMarkAddressed(note.id, chosen[note.id] as string)}
                  className="rounded-control border border-border-2 px-2.5 py-1.5 font-mono text-[12px] text-dim disabled:opacity-50"
                >
                  Mark addressed
                </button>
              </div>
            ) : null}
          </div>
        ))}
      </div>
    </div>
  );
}
