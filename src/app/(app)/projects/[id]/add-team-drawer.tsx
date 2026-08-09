"use client";

import { useId } from "react";
import { Drawer } from "@/shared/ui";

export interface AddTeamDrawerProps {
  addableTeams: Array<{ id: string; name: string }>;
  onAdd: (teamId: string) => void;
  onClose: () => void;
}

export function AddTeamDrawer({ addableTeams, onAdd, onClose }: AddTeamDrawerProps) {
  const titleId = useId();
  return (
    <Drawer onClose={onClose} labelledBy={titleId} widthClassName="w-[400px]">
        <div className="flex h-14 items-center justify-between border-b border-border px-5">
          <span id={titleId} className="font-display text-[15px] font-semibold">Add team</span>
          <button type="button" onClick={onClose} className="grid size-7.5 place-items-center rounded-control border border-border text-dim" aria-label="Close">
            ×
          </button>
        </div>
        <div className="flex flex-1 flex-col gap-2 overflow-y-auto px-5.5 py-5">
          {addableTeams.length === 0 ? (
            <div className="py-5 text-center text-[12px] text-faint">Every team is already on this project.</div>
          ) : (
            addableTeams.map((t) => (
              <div key={t.id} className="flex items-center gap-2.5 rounded-control border border-border bg-surface px-3.5 py-2.5">
                <span className="flex-1 text-[13px] font-medium">{t.name}</span>
                <button
                  type="button"
                  onClick={() => onAdd(t.id)}
                  className="rounded-control bg-a px-3 py-1.5 font-semibold text-[11.5px] text-a-fg"
                >
                  Add
                </button>
              </div>
            ))
          )}
        </div>
    </Drawer>
  );
}
