"use client";

import { useState } from "react";

export type KeyRevealModalProps = {
  rawKey: string;
  onClose: () => void;
};

export function KeyRevealModal({ rawKey, onClose }: KeyRevealModalProps) {
  const [copyLabel, setCopyLabel] = useState("Copy");

  async function copy() {
    try {
      await navigator.clipboard.writeText(rawKey);
      setCopyLabel("Copied!");
    } catch {
      // clipboard API unavailable — the raw value is still selectable text
    }
  }

  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center p-6">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-[3px]" />
      <div className="relative w-full max-w-[480px] rounded-card border border-border-2 bg-panel p-6.5 shadow-heavy">
        <div className="mb-3.5 flex items-center gap-2.5">
          <span className="grid size-8.5 place-items-center rounded-tile bg-green-soft">
            ✓
          </span>
          <span className="font-display text-[18px] font-bold tracking-tight">
            Key created
          </span>
        </div>
        <p className="mb-4 text-[13px] leading-relaxed text-dim">
          Copy this key now — for your security, it won&apos;t be shown again. Only its
          prefix will be visible afterward.
        </p>
        <div className="mb-4 flex items-center gap-2.5 rounded-card border border-border-2 bg-surface p-3">
          <span className="min-w-0 flex-1 break-all font-mono text-[12.5px] text-a">
            {rawKey}
          </span>
          <button
            type="button"
            onClick={copy}
            className="flex-none rounded-control border border-border-2 bg-surface-2 px-2.5 py-1.5 font-mono text-[11px] text-text"
          >
            {copyLabel}
          </button>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="h-11 w-full rounded-control bg-a text-[14px] font-semibold text-a-fg"
        >
          I&apos;ve saved it — done
        </button>
      </div>
    </div>
  );
}
