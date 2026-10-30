"use client";

import { useId } from "react";
import { Drawer } from "@/shared/ui";

export interface AddableSkill {
  id: string;
  name: string;
  description: string;
  /** Personal skills are added through the Share grant path (PDR-016). */
  personal: boolean;
}

export interface AddSkillDrawerProps {
  addableSkills: AddableSkill[];
  onAdd: (skill: AddableSkill) => void;
  onClose: () => void;
}

export function AddSkillDrawer({ addableSkills, onAdd, onClose }: AddSkillDrawerProps) {
  const titleId = useId();
  return (
    <Drawer onClose={onClose} labelledBy={titleId} widthClassName="w-[400px]">
      <div className="flex h-14 items-center justify-between border-b border-border px-5">
        <span id={titleId} className="font-display text-[15px] font-semibold">Add skill</span>
        <button type="button" onClick={onClose} className="grid size-7.5 place-items-center rounded-control border border-border text-dim" aria-label="Close">
          ×
        </button>
      </div>
      <div className="flex flex-1 flex-col gap-2 overflow-y-auto px-5.5 py-5">
        {addableSkills.length === 0 ? (
          <div className="py-5 text-center text-[12px] text-faint">No more skills available to add.</div>
        ) : (
          addableSkills.map((s) => (
            <div key={s.id} className="flex items-center gap-2.5 rounded-control border border-border bg-surface px-3.5 py-2.5">
              <div className="min-w-0 flex-1">
                <div className="font-mono text-[13px] font-semibold">{s.name}</div>
                {s.description ? <div className="text-[12px] text-dim">{s.description}</div> : null}
              </div>
              <button
                type="button"
                onClick={() => onAdd(s)}
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
