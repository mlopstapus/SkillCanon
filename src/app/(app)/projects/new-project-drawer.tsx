"use client";

import { useState, useTransition } from "react";
import type { ProjectActionResult } from "./actions";

export interface NewProjectValues {
  name: string;
  teamId: string;
  leadUserId?: string;
  description?: string;
}

export interface NewProjectDrawerProps {
  teamOptions: Array<{ id: string; name: string }>;
  userOptions: Array<{ id: string; name: string }>;
  onClose: () => void;
  onSubmit: (values: NewProjectValues) => Promise<ProjectActionResult>;
}

export function NewProjectDrawer({ teamOptions, userOptions, onClose, onSubmit }: NewProjectDrawerProps) {
  const [name, setName] = useState("");
  const [teamId, setTeamId] = useState(teamOptions[0]?.id ?? "");
  const [leadUserId, setLeadUserId] = useState("");
  const [description, setDescription] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function submit() {
    setError(null);
    startTransition(async () => {
      const result = await onSubmit({
        name,
        teamId,
        leadUserId: leadUserId || undefined,
        description: description || undefined,
      });
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
          <span className="font-display text-[15px] font-semibold">New project</span>
          <button type="button" onClick={onClose} className="grid size-7.5 place-items-center rounded-control border border-border text-dim" aria-label="Close">
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
              placeholder="Data Migration"
              className="rounded-control border border-border-2 bg-surface px-3 py-2.5 text-[13px] text-text outline-none focus:border-a"
            />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-[12px] font-semibold text-dim">Team</span>
            <select
              value={teamId}
              onChange={(e) => setTeamId(e.target.value)}
              className="rounded-control border border-border-2 bg-surface px-3 py-2.5 text-[13px] text-text outline-none"
            >
              {teamOptions.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-[12px] font-semibold text-dim">Lead</span>
            <select
              value={leadUserId}
              onChange={(e) => setLeadUserId(e.target.value)}
              className="rounded-control border border-border-2 bg-surface px-3 py-2.5 text-[13px] text-text outline-none"
            >
              <option value="">—</option>
              {userOptions.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-[12px] font-semibold text-dim">Description</span>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              placeholder="What this project owns…"
              className="resize-y rounded-control border border-border-2 bg-surface px-3 py-2.5 text-[13px] text-text outline-none focus:border-a"
            />
          </label>
        </div>
        <div className="flex justify-end gap-2.5 border-t border-border px-5.5 py-3.5">
          <button type="button" onClick={onClose} className="rounded-control border border-border-2 bg-surface px-4 py-2.5 text-[13px] font-semibold text-text">
            Cancel
          </button>
          <button
            type="button"
            disabled={isPending || !name || !teamId}
            onClick={submit}
            className="rounded-control bg-a px-4.5 py-2.5 text-[13px] font-semibold text-a-fg shadow-glow disabled:opacity-50"
          >
            {isPending ? "Creating…" : "Create project"}
          </button>
        </div>
      </div>
    </div>
  );
}
