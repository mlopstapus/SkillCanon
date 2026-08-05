"use client";

import type { PromptDetailData } from "./prompt-detail-view";

export interface AssignProjectsDrawerProps {
  promptName: string;
  assignments: PromptDetailData["projectAssignment"];
  onSetRequirement: (projectId: string, requirement: "required" | "optional" | null) => void;
  onClose: () => void;
}

export function AssignProjectsDrawer({
  promptName,
  assignments,
  onSetRequirement,
  onClose,
}: AssignProjectsDrawerProps) {
  return (
    <div className="fixed inset-0 z-[100]">
      <div onClick={onClose} className="absolute inset-0 bg-black/60 backdrop-blur-[2px]" aria-hidden="true" />
      <div className="absolute inset-y-0 right-0 flex w-[452px] max-w-[92vw] flex-col border-l border-border-2 bg-panel shadow-drawer">
        <div className="flex h-14 items-center justify-between border-b border-border px-5">
          <span className="font-display text-[15px] font-semibold">Assign {promptName} to projects</span>
          <button type="button" onClick={onClose} className="grid size-7.5 place-items-center rounded-control border border-border text-dim" aria-label="Close">
            ×
          </button>
        </div>
        <div className="flex flex-1 flex-col gap-2.5 overflow-y-auto px-5.5 py-5">
          <p className="mb-1 text-[11.5px] leading-relaxed text-dim">
            A prompt can be required, optional, or unassigned in any number of projects.
          </p>
          {assignments.map((a) => (
            <div key={a.projectId} className="flex items-center gap-2.5 rounded-control border border-border bg-surface px-3 py-2.5">
              <span className="min-w-0 flex-1 text-[13px] font-semibold">{a.projectName}</span>
              <div className="flex gap-0.5 rounded-control border border-border-2 bg-surface-2 p-0.5">
                {(
                  [
                    [null, "None"],
                    ["optional", "Optional"],
                    ["required", "Required"],
                  ] as const
                ).map(([value, label]) => (
                  <button
                    key={label}
                    type="button"
                    onClick={() => onSetRequirement(a.projectId, value)}
                    className={`rounded-[6px] px-2.5 py-1 font-mono text-[10.5px] ${
                      a.requirement === value ? "bg-a-soft text-a" : "text-faint"
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
