"use client";

import { useState, useTransition } from "react";
import type { PolicyEnforcementType } from "@/bcs/governance";
import type { GovernanceActionResult } from "./actions";

export interface PolicyFormValues {
  name: string;
  enforcementType: PolicyEnforcementType;
  priority: number;
  content: string;
}

export interface PolicyDrawerProps {
  scopeLabel: string;
  mode: "create" | "edit";
  initialValues?: PolicyFormValues;
  onClose: () => void;
  onSubmit: (values: PolicyFormValues) => Promise<GovernanceActionResult>;
}

/**
 * Mirrors governance's POLICY_ENFORCEMENT_TYPES (domain/policy.ts) — not
 * imported directly, since a "use client" component importing any real
 * (non-type) value from a BC barrel drags that BC's whole server-side
 * dependency graph (postgres, tls, ...) into the browser bundle, per this
 * repo's documented gotcha (031-governance-views-ui, caught by pnpm build).
 */
const ENFORCEMENT_TYPES: PolicyEnforcementType[] = ["prepend", "append", "inject", "validate"];

const MODE_DESCRIPTIONS: Record<PolicyEnforcementType, string> = {
  prepend: "before prompt",
  append: "after prompt",
  inject: "into template",
  validate: "checked, not injected",
};

export function PolicyDrawer({ scopeLabel, mode, initialValues, onClose, onSubmit }: PolicyDrawerProps) {
  const [name, setName] = useState(initialValues?.name ?? "");
  const [enforcementType, setEnforcementType] = useState<PolicyEnforcementType>(
    initialValues?.enforcementType ?? "append",
  );
  const [priority, setPriority] = useState(initialValues?.priority ?? 30);
  const [content, setContent] = useState(initialValues?.content ?? "");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function submit() {
    setError(null);
    startTransition(async () => {
      const result = await onSubmit({ name, enforcementType, priority, content });
      if (!result.ok) {
        setError(result.error);
      }
    });
  }

  return (
    <div className="fixed inset-0 z-[100]">
      <div onClick={onClose} className="absolute inset-0 bg-black/60 backdrop-blur-[2px]" />
      <div className="absolute inset-y-0 right-0 flex w-[452px] max-w-[92vw] flex-col border-l border-border-2 bg-panel shadow-drawer">
        <div className="flex h-14 items-center justify-between border-b border-border px-5">
          <div className="flex items-center gap-2.5">
            <span className="font-display text-[15px] font-semibold">
              {mode === "create" ? "New policy" : "Edit policy"}
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
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="require-typed-errors"
              className="rounded-control border border-border-2 bg-surface px-3 py-2.5 font-mono text-[13px] text-text outline-none focus:border-a"
            />
            <span className="font-mono text-[11px] text-faint">lowercase, hyphenated · becomes part of the audit trail</span>
          </label>
          <div>
            <span className="mb-1.5 block text-[12px] font-semibold text-dim">Enforcement</span>
            <div className="grid grid-cols-2 gap-2">
              {ENFORCEMENT_TYPES.map((value) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setEnforcementType(value)}
                  className={`rounded-control border p-2.5 text-left font-mono ${
                    enforcementType === value ? "border-a bg-a-soft text-a" : "border-border-2 bg-surface text-dim"
                  }`}
                >
                  <div className="text-[12px] font-semibold">{value}</div>
                  <div className="mt-0.5 text-[10px] text-faint">{MODE_DESCRIPTIONS[value]}</div>
                </button>
              ))}
            </div>
          </div>
          <label className="flex flex-col gap-1.5">
            <span className="text-[12px] font-semibold text-dim">Priority</span>
            <input
              type="number"
              value={priority}
              onChange={(e) => setPriority(Number(e.target.value))}
              className="w-24 rounded-control border border-border-2 bg-surface px-3 py-2.5 font-mono text-[13px] text-text outline-none focus:border-a"
            />
            <span className="font-mono text-[11.5px] text-faint">higher runs first when merged</span>
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-[12px] font-semibold text-dim">Content</span>
            <textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              rows={5}
              placeholder="Describe the rule this policy enforces on every expanded prompt…"
              className="resize-y rounded-control border border-border-2 bg-surface px-3 py-2.5 text-[13px] leading-[1.55] text-text outline-none focus:border-a"
            />
          </label>
          <div className="flex gap-2.5 rounded-control border border-a/26 bg-a-soft p-3">
            <p className="text-[11.5px] leading-[1.5] text-dim">
              This policy is defined at <span className="text-text">{scopeLabel}</span> and cascades to all
              descendant teams and users as an <span className="text-text">inherited, immutable</span> rule.
            </p>
          </div>
        </div>
        <div className="flex justify-end gap-2.5 border-t border-border px-5.5 py-3.5">
          <button type="button" onClick={onClose} className="rounded-control border border-border-2 bg-surface px-4 py-2.5 text-[13px] font-semibold text-text">
            Cancel
          </button>
          <button
            type="button"
            disabled={isPending || !name || !content}
            onClick={submit}
            className="rounded-control bg-a px-4.5 py-2.5 text-[13px] font-semibold text-a-fg shadow-glow disabled:opacity-50"
          >
            {isPending ? "Saving…" : mode === "create" ? "Create policy" : "Save changes"}
          </button>
        </div>
      </div>
    </div>
  );
}
