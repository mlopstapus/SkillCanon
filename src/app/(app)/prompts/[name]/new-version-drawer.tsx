"use client";

import { useState, useTransition } from "react";
import type { PromptActionResult } from "../actions";

export interface NewVersionValues {
  systemTemplate?: string;
  userTemplate?: string;
  tags?: string[];
  setActive: boolean;
}

export interface NewVersionDrawerProps {
  promptName: string;
  nextVersionLabel: string;
  systemTemplate: string;
  userTemplate: string;
  tags: string[];
  onClose: () => void;
  onSubmit: (values: NewVersionValues) => Promise<PromptActionResult>;
}

export function NewVersionDrawer({
  promptName,
  nextVersionLabel,
  systemTemplate,
  userTemplate,
  tags,
  onClose,
  onSubmit,
}: NewVersionDrawerProps) {
  const [system, setSystem] = useState(systemTemplate);
  const [user, setUser] = useState(userTemplate);
  const [tagsInput, setTagsInput] = useState(tags.join(", "));
  const [setActive, setSetActive] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function submit() {
    setError(null);
    startTransition(async () => {
      const result = await onSubmit({
        systemTemplate: system || undefined,
        userTemplate: user || undefined,
        tags: tagsInput
          ? tagsInput
              .split(",")
              .map((t) => t.trim())
              .filter(Boolean)
          : undefined,
        setActive,
      });
      if (!result.ok) {
        setError(result.error);
      }
    });
  }

  return (
    <div className="fixed inset-0 z-[100]">
      <div onClick={onClose} className="absolute inset-0 bg-black/60 backdrop-blur-[2px]" />
      <div className="absolute inset-y-0 right-0 flex w-[480px] max-w-[92vw] flex-col border-l border-border-2 bg-panel shadow-drawer">
        <div className="flex h-14 items-center justify-between border-b border-border px-5">
          <span className="font-display text-[15px] font-semibold">New version of {promptName}</span>
          <button type="button" onClick={onClose} className="grid size-7.5 place-items-center rounded-control border border-border text-dim" aria-label="Close">
            ×
          </button>
        </div>
        <div className="flex flex-1 flex-col gap-4 overflow-y-auto px-5.5 py-5">
          {error ? (
            <div className="rounded-card border border-red/30 bg-red-soft p-3 text-[12px] text-red">{error}</div>
          ) : null}
          <div className="rounded-card border border-a/25 bg-a-soft p-3 text-[11.5px] leading-relaxed text-dim">
            Publishing creates a new immutable version ({nextVersionLabel}). Existing versions are never edited.
          </div>
          <label className="flex flex-col gap-1.5">
            <span className="text-[12px] font-semibold text-dim">System template</span>
            <textarea
              value={system}
              onChange={(e) => setSystem(e.target.value)}
              rows={3}
              className="resize-y rounded-control border border-border-2 bg-surface px-3 py-2.5 font-mono text-[12.5px] text-text outline-none focus:border-a"
            />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-[12px] font-semibold text-dim">User template</span>
            <textarea
              value={user}
              onChange={(e) => setUser(e.target.value)}
              rows={3}
              className="resize-y rounded-control border border-border-2 bg-surface px-3 py-2.5 font-mono text-[12.5px] text-text outline-none focus:border-a"
            />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-[12px] font-semibold text-dim">Tags</span>
            <input
              value={tagsInput}
              onChange={(e) => setTagsInput(e.target.value)}
              className="rounded-control border border-border-2 bg-surface px-3 py-2.5 font-mono text-[12.5px] text-text outline-none focus:border-a"
            />
          </label>
          <label className="flex items-center gap-2.5 rounded-control border border-border bg-surface px-2.5 py-2.5">
            <input type="checkbox" checked={setActive} onChange={(e) => setSetActive(e.target.checked)} />
            <span className="text-[12.5px] text-text">Set as active version immediately</span>
          </label>
        </div>
        <div className="flex justify-end gap-2.5 border-t border-border px-5.5 py-3.5">
          <button type="button" onClick={onClose} className="rounded-control border border-border-2 bg-surface px-4 py-2.5 text-[13px] font-semibold text-text">
            Cancel
          </button>
          <button
            type="button"
            disabled={isPending}
            onClick={submit}
            className="rounded-control bg-a px-4.5 py-2.5 text-[13px] font-semibold text-a-fg shadow-glow disabled:opacity-50"
          >
            {isPending ? "Publishing…" : "Publish version"}
          </button>
        </div>
      </div>
    </div>
  );
}
