"use client";

import { useId, useState, useTransition } from "react";
import { Drawer } from "@/shared/ui";
import type { GovernanceActionResult } from "./actions";

export interface ObjectiveFormValues {
  title: string;
  description: string;
}

export interface ObjectiveDrawerProps {
  scopeLabel: string;
  scopeKind: "team" | "person";
  mode: "create" | "edit";
  initialValues?: ObjectiveFormValues;
  onClose: () => void;
  onSubmit: (values: ObjectiveFormValues) => Promise<GovernanceActionResult>;
}

export function ObjectiveDrawer({ scopeLabel, scopeKind, mode, initialValues, onClose, onSubmit }: ObjectiveDrawerProps) {
  const titleId = useId();
  const [title, setTitle] = useState(initialValues?.title ?? "");
  const [description, setDescription] = useState(initialValues?.description ?? "");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function submit() {
    setError(null);
    startTransition(async () => {
      const result = await onSubmit({ title, description });
      if (!result.ok) {
        setError(result.error);
      }
    });
  }

  return (
    <Drawer onClose={onClose} labelledBy={titleId} widthClassName="w-[452px]">
        <div className="flex h-14 items-center justify-between border-b border-border px-5">
          <div className="flex items-center gap-2.5">
            <span id={titleId} className="font-display text-[15px] font-semibold">
              {mode === "create" ? "New objective" : "Edit objective"}
            </span>
            <span className="rounded-control border border-border-2 px-2 py-0.5 font-mono text-[10.5px] text-dim">
              at {scopeLabel}
            </span>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="grid size-7.5 place-items-center rounded-control border border-border text-dim">
            ×
          </button>
        </div>
        <div className="flex flex-1 flex-col gap-5 overflow-y-auto px-5.5 py-5">
          {error ? (
            <div className="rounded-card border border-red/30 bg-red-soft p-3 text-[12px] text-red">{error}</div>
          ) : null}
          <label className="flex flex-col gap-1.5">
            <span className="text-[12px] font-semibold text-dim">Name</span>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="reduce-inference-cost"
              className="rounded-control border border-border-2 bg-surface px-3 py-2.5 font-mono text-[13px] text-text outline-none focus:border-a"
            />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-[12px] font-semibold text-dim">Content</span>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={5}
              placeholder="Describe the goal this objective surfaces as guidance…"
              className="resize-y rounded-control border border-border-2 bg-surface px-3 py-2.5 text-[13px] leading-[1.55] text-text outline-none focus:border-a"
            />
          </label>
          <div className="flex gap-2.5 rounded-control border border-a/26 bg-a-soft p-3">
            <p className="text-[11.5px] leading-[1.5] text-dim">
              {scopeKind === "team" ? (
                <>
                  This objective is defined at <span className="text-text">{scopeLabel}</span> and cascades to
                  all descendant teams and users as <span className="text-text">inherited, immutable</span>{" "}
                  guidance.
                </>
              ) : (
                <>
                  This objective is defined for <span className="text-text">{scopeLabel}</span> only — it does
                  not cascade to anyone else.
                </>
              )}
            </p>
          </div>
        </div>
        <div className="flex justify-end gap-2.5 border-t border-border px-5.5 py-3.5">
          <button type="button" onClick={onClose} className="rounded-control border border-border-2 bg-surface px-4 py-2.5 text-[13px] font-semibold text-text">
            Cancel
          </button>
          <button
            type="button"
            disabled={isPending || !title}
            onClick={submit}
            className="rounded-control bg-a px-4.5 py-2.5 text-[13px] font-semibold text-a-fg shadow-glow disabled:opacity-50"
          >
            {isPending ? "Saving…" : mode === "create" ? "Create objective" : "Save changes"}
          </button>
        </div>
    </Drawer>
  );
}
