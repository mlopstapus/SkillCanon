"use client";

import { useId, useMemo, useState, useTransition } from "react";
import type { Team, UserAccountSummary } from "@/bcs/identity-access";
import { Drawer } from "@/shared/ui";
import { assignUserToTeamAction } from "./actions";

function CandidateRow({
  user,
  currentTeamName,
  teamId,
  onAdded,
}: {
  user: UserAccountSummary;
  currentTeamName: string | null;
  teamId: string;
  onAdded: () => void;
}) {
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function add() {
    setError(null);
    startTransition(async () => {
      const result = await assignUserToTeamAction({ targetUserId: user.id, teamId });
      if (result.ok) {
        onAdded();
      } else {
        setError(result.error);
      }
    });
  }

  return (
    <div className="flex flex-col gap-1.5 rounded-card border border-border bg-surface p-3">
      <div className="flex items-center gap-3">
        <span className="grid size-7 place-items-center rounded-full border border-border-2 bg-surface-2 font-mono text-[11px] text-a">
          {user.displayName.charAt(0).toUpperCase()}
        </span>
        <div className="min-w-0 flex-1">
          <div className="text-[13px] font-semibold">{user.displayName}</div>
          <div className="mt-0.5 font-mono text-[11px] text-faint">
            {user.email} · {currentTeamName ? `on ${currentTeamName}` : "unassigned"}
          </div>
        </div>
        <button
          type="button"
          disabled={isPending}
          onClick={add}
          className="rounded-control border border-border-2 bg-surface px-3 py-1.5 text-[12px] font-semibold text-dim disabled:opacity-50"
        >
          {isPending ? "…" : currentTeamName ? "Move here" : "Add"}
        </button>
      </div>
      {error ? <p className="text-[11.5px] text-red">{error}</p> : null}
    </div>
  );
}

export type AddMemberDrawerProps = {
  teamId: string;
  teamName: string;
  /** Every org user not already on this team — unassigned users get added, users on another team are shown with that team's name and get moved here. */
  candidateUsers: UserAccountSummary[];
  /** Team id → Team, used to show "on <team>" for a candidate already assigned elsewhere. */
  teamsById: Map<string, Team>;
  onClose: () => void;
  onSuccess: () => void;
};

export function AddMemberDrawer({
  teamId,
  teamName,
  candidateUsers,
  teamsById,
  onClose,
  onSuccess,
}: AddMemberDrawerProps) {
  const titleId = useId();
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (q.length === 0) return candidateUsers;
    return candidateUsers.filter(
      (u) => u.displayName.toLowerCase().includes(q) || u.email.toLowerCase().includes(q),
    );
  }, [candidateUsers, query]);

  return (
    <Drawer onClose={onClose} labelledBy={titleId} widthClassName="w-[452px]">
      <div className="flex h-14 items-center justify-between border-b border-border px-5">
        <span id={titleId} className="font-display text-[15px] font-semibold">
          Add member
        </span>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="grid size-7.5 place-items-center rounded-control border border-border text-dim"
        >
          ×
        </button>
      </div>
      <div className="flex flex-1 flex-col gap-3 overflow-y-auto px-5.5 py-5">
        <p className="text-[12px] text-dim">
          Add an existing org member to <span className="text-text">{teamName}</span>. Anyone
          already on another team is moved here — people can only belong to one team at a time.
        </p>
        <input
          aria-label="Search people"
          placeholder="Search by name or email"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="rounded-control border border-border-2 bg-surface px-3 py-2.5 text-[13px] text-text outline-none focus:border-a"
        />
        <div className="flex flex-col gap-2">
          {candidateUsers.length === 0 ? (
            <p role="status" className="text-[12.5px] text-dim">
              Everyone in the org is already on this team.
            </p>
          ) : filtered.length === 0 ? (
            <p role="status" className="text-[12.5px] text-dim">
              No matching people.
            </p>
          ) : (
            filtered.map((u) => (
              <CandidateRow
                key={u.id}
                user={u}
                currentTeamName={u.teamId ? (teamsById.get(u.teamId)?.name ?? null) : null}
                teamId={teamId}
                onAdded={onSuccess}
              />
            ))
          )}
        </div>
      </div>
    </Drawer>
  );
}
