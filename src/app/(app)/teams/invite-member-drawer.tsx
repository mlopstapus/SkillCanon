"use client";

import { useState, useTransition } from "react";
import { inviteMemberAction } from "./actions";

export type InviteMemberDrawerProps = {
  teamId: string;
  teamName: string;
  onClose: () => void;
  onSuccess: () => void;
};

export function InviteMemberDrawer({
  teamId,
  teamName,
  onClose,
  onSuccess,
}: InviteMemberDrawerProps) {
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"admin" | "member">("member");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function submit() {
    setError(null);
    startTransition(async () => {
      const result = await inviteMemberAction({ teamId, email, role });
      if (result.ok) {
        onSuccess();
      } else {
        setError(result.error);
      }
    });
  }

  return (
    <div className="fixed inset-0 z-[100]">
      <div onClick={onClose} className="absolute inset-0 bg-black/60 backdrop-blur-[2px]" />
      <div className="absolute inset-y-0 right-0 flex w-[452px] max-w-[92vw] flex-col border-l border-border-2 bg-panel shadow-drawer">
        <div className="flex h-14 items-center justify-between border-b border-border px-5">
          <span className="font-display text-[15px] font-semibold">Invite member</span>
          <button
            type="button"
            onClick={onClose}
            className="grid size-7.5 place-items-center rounded-control border border-border text-dim"
            aria-label="Close"
          >
            ×
          </button>
        </div>
        <div className="flex flex-1 flex-col gap-4.5 overflow-y-auto px-5.5 py-5">
          <p className="text-[12px] text-dim">
            Invite a new member to <span className="text-text">{teamName}</span>.
          </p>
          {error ? (
            <div className="rounded-card border border-red/30 bg-red-soft p-3 text-[12px] text-red">
              {error}
            </div>
          ) : null}
          <label className="flex flex-col gap-1.5">
            <span className="text-[12px] font-semibold text-dim">Email</span>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="jamie@example.com"
              className="rounded-control border border-border-2 bg-surface px-3 py-2.5 text-[13px] text-text outline-none focus:border-a"
            />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-[12px] font-semibold text-dim">Role</span>
            <select
              value={role}
              onChange={(e) => setRole(e.target.value as "admin" | "member")}
              className="rounded-control border border-border-2 bg-surface px-3 py-2.5 text-[13px] text-text outline-none"
            >
              <option value="member">Member</option>
              <option value="admin">Admin</option>
            </select>
          </label>
        </div>
        <div className="flex justify-end gap-2.5 border-t border-border px-5.5 py-3.5">
          <button
            type="button"
            onClick={onClose}
            className="rounded-control border border-border-2 bg-surface px-4 py-2.5 text-[13px] font-semibold text-text"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={isPending || !email}
            onClick={submit}
            className="rounded-control bg-a px-4.5 py-2.5 text-[13px] font-semibold text-a-fg shadow-glow disabled:opacity-50"
          >
            {isPending ? "Sending…" : "Send invite"}
          </button>
        </div>
      </div>
    </div>
  );
}
