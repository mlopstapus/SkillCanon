"use client";

import { useId, useState, useTransition } from "react";
import { Drawer } from "@/shared/ui";
import type { PromptActionResult } from "../actions";

export interface CopySkillValues {
  name: string;
  description?: string;
}

export interface CopySkillDrawerProps {
  sourceName: string;
  sourceDescription: string;
  onClose: () => void;
  onSubmit: (values: CopySkillValues) => Promise<PromptActionResult>;
}

/**
 * Step 1 of the "Make a copy" flow (2026-08-15 design doc) — collects the
 * copy's name/description, prefilled from the source and fully editable.
 * On success the caller opens Step 2 (a source-prefilled New Version
 * drawer) to edit and publish the copy's actual content; this drawer never
 * touches content itself.
 */
export function CopySkillDrawer({ sourceName, sourceDescription, onClose, onSubmit }: CopySkillDrawerProps) {
  const titleId = useId();
  const [name, setName] = useState(`${sourceName}-copy`);
  const [description, setDescription] = useState(sourceDescription);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function submit() {
    setError(null);
    startTransition(async () => {
      const result = await onSubmit({ name, description: description || undefined });
      if (!result.ok) {
        setError(result.error);
      }
    });
  }

  return (
    <Drawer onClose={onClose} labelledBy={titleId} widthClassName="w-[480px]">
      <div className="flex h-14 items-center justify-between border-b border-border px-5">
        <span id={titleId} className="font-display text-[15px] font-semibold">
          Copy skill
        </span>
        <button
          type="button"
          onClick={onClose}
          className="grid size-7.5 place-items-center rounded-control border border-border text-dim"
          aria-label="Close"
        >
          ×
        </button>
      </div>

      <div className="flex flex-1 flex-col gap-4 overflow-y-auto px-5.5 py-5">
        {error ? (
          <div className="rounded-card border border-red/30 bg-red-soft p-3 text-[12px] text-red">{error}</div>
        ) : null}
        <label className="flex flex-col gap-1.5">
          <span className="text-[12px] font-semibold text-dim">Name</span>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="rounded-control border border-border-2 bg-surface px-3 py-2.5 font-mono text-[13px] text-text outline-none focus:border-a"
          />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="text-[12px] font-semibold text-dim">Description</span>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={2}
            className="resize-y rounded-control border border-border-2 bg-surface px-3 py-2.5 text-[13px] text-text outline-none focus:border-a"
          />
        </label>
        <div className="rounded-card border border-a/25 bg-a-soft p-3 text-[11.5px] leading-relaxed text-dim">
          Creates an independent copy under your ownership. Next you&apos;ll be able to edit its content
          before it&apos;s published as v1.
        </div>
      </div>

      <div className="flex justify-end gap-2.5 border-t border-border px-5.5 py-3.5">
        <button
          type="button"
          onClick={onClose}
          className="rounded-control border border-border-2 bg-surface px-4 py-2.5 text-[13px] font-semibold text-text"
        >
          Cancel
        </button>
        <button
          type="button"
          disabled={isPending || !name.trim()}
          onClick={submit}
          className="rounded-control bg-a px-4.5 py-2.5 text-[13px] font-semibold text-a-fg shadow-glow disabled:opacity-50"
        >
          {isPending ? "Copying…" : "Copy & edit content"}
        </button>
      </div>
    </Drawer>
  );
}
