"use client";

import { useId } from "react";
import { Badge, Drawer } from "@/shared/ui";
import type { PromptDetailData } from "./prompt-detail-view";

export interface VersionHistoryDrawerProps {
  versions: PromptDetailData["versions"];
  onClose: () => void;
  onSetActive: (version: string) => void;
}

export function VersionHistoryDrawer({ versions, onClose, onSetActive }: VersionHistoryDrawerProps) {
  const titleId = useId();
  return (
    <Drawer onClose={onClose} labelledBy={titleId} widthClassName="w-[480px]">
        <div className="flex h-14 items-center justify-between border-b border-border px-5">
          <span id={titleId} className="font-display text-[15px] font-semibold">Version history</span>
          <button type="button" onClick={onClose} className="grid size-7.5 place-items-center rounded-control border border-border text-dim" aria-label="Close">
            ×
          </button>
        </div>
        <div className="flex flex-1 flex-col gap-2.5 overflow-y-auto px-5 py-4.5">
          {versions.map((v) => (
            <div key={v.id} className="rounded-card border border-border bg-surface p-3.5">
              <div className="mb-2 flex items-center gap-2">
                <span className="font-mono text-[12.5px] font-semibold">{v.version}</span>
                <span className="font-mono text-[10.5px] text-faint">{v.createdAt}</span>
                {v.isActive ? (
                  <Badge variant="accent">active</Badge>
                ) : (
                  <button
                    type="button"
                    onClick={() => onSetActive(v.version)}
                    className="ml-auto rounded-[6px] border border-border-2 bg-surface-2 px-2 py-0.5 font-mono text-[10px] text-dim"
                  >
                    Set active
                  </button>
                )}
              </div>
              <div className="mb-2 flex flex-wrap gap-1">
                {v.tags.map((tag) => (
                  <Badge key={tag}>{tag}</Badge>
                ))}
              </div>
              <pre className="m-0 max-h-[70px] overflow-hidden font-mono text-[11px] leading-relaxed text-dim">
                {v.kind === "chain" ? `${v.stepCount} steps` : (v.contentPreview ?? "—")}
              </pre>
            </div>
          ))}
        </div>
    </Drawer>
  );
}
