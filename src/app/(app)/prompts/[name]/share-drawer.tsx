"use client";

import { useState } from "react";
import type { PromptDetailData } from "./prompt-detail-view";

export interface ShareDrawerProps {
  promptName: string;
  shareState: PromptDetailData["shareState"];
  onToggleUser: (userId: string, subscriptionId: string | null) => void;
  onToggleTeam: (teamId: string, subscriptionId: string | null) => void;
  onToggleProject: (projectId: string, subscriptionId: string | null) => void;
  onClose: () => void;
}

function GrantRow({
  name,
  granted,
  onToggle,
}: {
  name: string;
  granted: boolean;
  onToggle: () => void;
}) {
  return (
    <div className="flex items-center gap-2.5 rounded-control border border-border bg-surface px-3 py-2.5">
      <span className="min-w-0 flex-1 text-[13px] font-medium">{name}</span>
      <button
        type="button"
        onClick={onToggle}
        className={`rounded-control border px-3 py-1.5 font-mono text-[11px] font-semibold ${
          granted ? "border-border-2 bg-transparent text-dim" : "border-transparent bg-a text-a-fg"
        }`}
      >
        {granted ? "Revoke" : "Grant"}
      </button>
    </div>
  );
}

export function ShareDrawer({
  promptName,
  shareState,
  onToggleUser,
  onToggleTeam,
  onToggleProject,
  onClose,
}: ShareDrawerProps) {
  const [query, setQuery] = useState("");
  const q = query.trim().toLowerCase();
  const matches = (name: string) => !q || name.toLowerCase().includes(q);

  return (
    <div className="fixed inset-0 z-[100]">
      <div onClick={onClose} className="absolute inset-0 bg-black/60 backdrop-blur-[2px]" aria-hidden="true" />
      <div className="absolute inset-y-0 right-0 flex w-[452px] max-w-[92vw] flex-col border-l border-border-2 bg-panel shadow-drawer">
        <div className="flex h-14 items-center justify-between border-b border-border px-5">
          <span className="font-display text-[15px] font-semibold">Share {promptName}</span>
          <button type="button" onClick={onClose} className="grid size-7.5 place-items-center rounded-control border border-border text-dim" aria-label="Close">
            ×
          </button>
        </div>
        <div className="flex flex-1 flex-col gap-4.5 overflow-y-auto px-5.5 py-5">
          <div className="rounded-control border border-violet/25 bg-violet-soft p-3 text-[11.5px] leading-relaxed text-dim">
            Members of a shared team or project can subscribe to get live updates as new versions publish, or make a
            copy they own and edit independently.
          </div>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search people, teams, projects…"
            className="rounded-control border border-border-2 bg-surface px-3 py-2 text-[12.5px] text-text outline-none"
          />
          <div>
            <div className="mb-2 font-mono text-[10px] tracking-[0.1em] text-faint uppercase">People</div>
            <div className="flex flex-col gap-2">
              {shareState.users.filter((u) => matches(u.name)).map((u) => (
                <GrantRow
                  key={u.id}
                  name={u.name}
                  granted={u.granted}
                  onToggle={() => onToggleUser(u.id, u.subscriptionId)}
                />
              ))}
            </div>
          </div>
          <div>
            <div className="mb-2 font-mono text-[10px] tracking-[0.1em] text-faint uppercase">Teams</div>
            <div className="flex flex-col gap-2">
              {shareState.teams.filter((t) => matches(t.name)).map((t) => (
                <GrantRow
                  key={t.id}
                  name={t.name}
                  granted={t.granted}
                  onToggle={() => onToggleTeam(t.id, t.subscriptionId)}
                />
              ))}
            </div>
          </div>
          <div>
            <div className="mb-2 font-mono text-[10px] tracking-[0.1em] text-faint uppercase">Projects</div>
            <div className="flex flex-col gap-2">
              {shareState.projects.filter((p) => matches(p.name)).map((p) => (
                <GrantRow
                  key={p.id}
                  name={p.name}
                  granted={p.granted}
                  onToggle={() => onToggleProject(p.id, p.subscriptionId)}
                />
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
