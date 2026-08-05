"use client";

import { useState, useTransition } from "react";
import type { Team, UserAccountSummary } from "@/bcs/identity-access";
import { assignUserToTeamAction } from "./actions";

export type UnassignedUsersPanelProps = {
  users: UserAccountSummary[];
  teams: Team[];
  onAssigned: () => void;
};

function AssignRow({
  user,
  teams,
  onAssigned,
}: {
  user: UserAccountSummary;
  teams: Team[];
  onAssigned: () => void;
}) {
  const [teamId, setTeamId] = useState(teams[0]?.id ?? "");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function assign() {
    if (!teamId) return;
    setError(null);
    startTransition(async () => {
      const result = await assignUserToTeamAction({ targetUserId: user.id, teamId });
      if (result.ok) {
        onAssigned();
      } else {
        setError(result.error);
      }
    });
  }

  return (
    <div className="flex flex-col gap-2 rounded-card border border-border bg-surface p-3.5">
      <div className="flex items-center gap-3">
        <span className="grid size-7 place-items-center rounded-full border border-border-2 bg-surface-2 font-mono text-[11px] text-a">
          {user.displayName.charAt(0).toUpperCase()}
        </span>
        <div className="min-w-0 flex-1">
          <div className="text-[13px] font-semibold">{user.displayName}</div>
          <div className="mt-0.5 font-mono text-[11px] text-faint">{user.email}</div>
        </div>
        <select
          value={teamId}
          onChange={(e) => setTeamId(e.target.value)}
          className="rounded-control border border-border-2 bg-surface px-2.5 py-1.5 text-[12.5px] text-text outline-none"
        >
          {teams.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>
        <button
          type="button"
          disabled={isPending || !teamId}
          onClick={assign}
          className="rounded-control bg-a px-3 py-1.5 text-[12px] font-semibold text-a-fg shadow-glow disabled:opacity-50"
        >
          {isPending ? "Assigning…" : "Assign"}
        </button>
      </div>
      {error ? <p className="text-[11.5px] text-red">{error}</p> : null}
    </div>
  );
}

export function UnassignedUsersPanel({ users, teams, onAssigned }: UnassignedUsersPanelProps) {
  return (
    <div>
      <p className="mb-4 font-mono text-[10.5px] uppercase tracking-[0.12em] text-faint">
        Unassigned users
      </p>
      {users.length === 0 ? (
        <p role="status" className="text-[12.5px] text-dim">No unassigned users right now.</p>
      ) : (
        <div className="flex flex-col gap-2.5">
          {users.map((u) => (
            <AssignRow key={u.id} user={u} teams={teams} onAssigned={onAssigned} />
          ))}
        </div>
      )}
    </div>
  );
}
