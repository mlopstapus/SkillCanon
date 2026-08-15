"use client";

import { useCallback, useEffect, useId, useRef, useState, useTransition } from "react";
import { Drawer } from "@/shared/ui";
import type { PromptActionResult } from "../actions";

export interface TransferCandidate {
  id: string;
  name: string;
}

export interface TransferOwnershipDrawerProps {
  promptName: string;
  currentOwnerLabel: string;
  candidates: {
    users: TransferCandidate[];
    teams: TransferCandidate[];
  };
  onClose: () => void;
  onConfirm: (params: {
    newOwnerType: "user" | "team";
    newOwnerId: string;
  }) => Promise<PromptActionResult>;
}

export function TransferOwnershipDrawer({
  promptName,
  currentOwnerLabel,
  candidates,
  onClose,
  onConfirm,
}: TransferOwnershipDrawerProps) {
  const titleId = useId();
  const userTabId = useId();
  const teamTabId = useId();
  const userPanelId = useId();
  const teamPanelId = useId();
  const [mode, setMode] = useState<"user" | "team">("user");
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<{
    type: "user" | "team";
    candidate: TransferCandidate;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const confirmButtonRef = useRef<HTMLButtonElement>(null);
  const pendingStatusRef = useRef<HTMLParagraphElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const wasSelectedRef = useRef(false);
  const normalizedQuery = query.trim().toLowerCase();
  const matches = (candidate: TransferCandidate) =>
    !normalizedQuery || candidate.name.toLowerCase().includes(normalizedQuery);

  function choose(type: "user" | "team", candidate: TransferCandidate) {
    setSelected({ type, candidate });
  }

  const requestClose = useCallback(() => {
    if (!isPending) onClose();
  }, [isPending, onClose]);

  useEffect(() => {
    if (selected) {
      wasSelectedRef.current = true;
      confirmButtonRef.current?.focus();
    } else if (wasSelectedRef.current) {
      wasSelectedRef.current = false;
      searchInputRef.current?.focus();
    }
  }, [selected]);

  useEffect(() => {
    if (isPending) {
      pendingStatusRef.current?.focus();
    }
  }, [isPending]);

  function submit() {
    if (!selected) return;
    setError(null);
    startTransition(async () => {
      const result = await onConfirm({
        newOwnerType: selected.type,
        newOwnerId: selected.candidate.id,
      });
      if (result.ok) {
        onClose();
      } else {
        setError(result.error);
      }
    });
  }

  return (
    <Drawer onClose={requestClose} labelledBy={titleId} widthClassName="w-[452px]">
      <div className="flex h-14 items-center justify-between border-b border-border px-5">
        <span id={titleId} className="font-display text-[15px] font-semibold">
          Transfer {promptName}
        </span>
        <button type="button" disabled={isPending} onClick={requestClose} aria-label="Close">
          ×
        </button>
      </div>
      <div className="flex flex-1 flex-col gap-4 overflow-y-auto px-5.5 py-5">
        {error ? (
          <div role="alert" className="rounded-card border border-red/30 bg-red-soft p-3 text-[12px] text-red">
            {error}
          </div>
        ) : null}
        <div className={selected ? "hidden" : "flex flex-col gap-4"}>
          <div
            role="group"
            aria-label="New owner type"
            className="flex gap-0.5 rounded-control border border-border-2 bg-surface p-0.5"
          >
            <button
              id={userTabId}
              type="button"
              aria-pressed={mode === "user"}
              aria-controls={userPanelId}
              onClick={() => setMode("user")}
              className={`flex-1 rounded-[7px] px-3 py-2 font-mono text-[11.5px] ${
                mode === "user" ? "bg-a-soft text-a" : "text-dim"
              }`}
            >
              People
            </button>
            <button
              id={teamTabId}
              type="button"
              aria-pressed={mode === "team"}
              aria-controls={teamPanelId}
              onClick={() => setMode("team")}
              className={`flex-1 rounded-[7px] px-3 py-2 font-mono text-[11.5px] ${
                mode === "team" ? "bg-a-soft text-a" : "text-dim"
              }`}
            >
              Teams
            </button>
          </div>
          <input
            ref={searchInputRef}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            aria-label="Search transfer candidates"
            placeholder="Search people or teams…"
            className="rounded-control border border-border-2 bg-surface px-3 py-2 text-[12.5px] text-text outline-none"
          />
          <div
            id={userPanelId}
            role="region"
            aria-labelledby={userTabId}
            className={mode === "user" ? "flex flex-col gap-2" : "hidden"}
          >
            {candidates.users.filter(matches).map((candidate) => (
              <button
                key={candidate.id}
                type="button"
                onClick={() => choose("user", candidate)}
                className="rounded-control border border-border bg-surface px-3 py-2.5 text-left text-[13px] font-medium"
              >
                {candidate.name}
              </button>
            ))}
          </div>
          <div
            id={teamPanelId}
            role="region"
            aria-labelledby={teamTabId}
            className={mode === "team" ? "flex flex-col gap-2" : "hidden"}
          >
            {candidates.teams.filter(matches).map((candidate) => (
              <button
                key={candidate.id}
                type="button"
                onClick={() => choose("team", candidate)}
                className="rounded-control border border-border bg-surface px-3 py-2.5 text-left text-[13px] font-medium"
              >
                {candidate.name}
              </button>
            ))}
          </div>
        </div>
        <div className={selected ? "flex flex-col gap-4" : "hidden"}>
          <p className="text-[13px] leading-relaxed text-text">
            Transfer <strong className="font-semibold text-a">{promptName}</strong> from{" "}
            <strong className="font-semibold text-a">{currentOwnerLabel}</strong> to{" "}
            <strong className="font-semibold text-a">{selected?.candidate.name}</strong>?
          </p>
          <div className="rounded-card border border-amber-400/30 bg-amber-400/10 p-3 text-[11.5px] leading-relaxed text-dim">
            The current owner may lose access unless otherwise subscribed.
          </div>
          {isPending ? (
            <p ref={pendingStatusRef} role="status" tabIndex={-1} className="text-[12px] text-dim outline-none">
              Transferring ownership…
            </p>
          ) : null}
        </div>
      </div>
      <div className="flex justify-end gap-2.5 border-t border-border px-5.5 py-3.5">
        {selected ? (
          <button
            type="button"
            disabled={isPending}
            onClick={() => {
              setSelected(null);
              setError(null);
            }}
            className="mr-auto rounded-control border border-border-2 bg-surface px-4 py-2.5 text-[13px] font-semibold text-text disabled:opacity-50"
          >
            Back
          </button>
        ) : null}
        <button
          type="button"
          disabled={isPending}
          onClick={requestClose}
          className="rounded-control border border-border-2 bg-surface px-4 py-2.5 text-[13px] font-semibold text-text disabled:opacity-50"
        >
          Cancel
        </button>
        {selected ? (
          <button
            ref={confirmButtonRef}
            type="button"
            disabled={isPending}
            onClick={submit}
            className="rounded-control bg-red px-4.5 py-2.5 text-[13px] font-semibold text-white disabled:opacity-50"
          >
            {isPending ? "Transferring…" : "Transfer ownership"}
          </button>
        ) : null}
      </div>
    </Drawer>
  );
}
