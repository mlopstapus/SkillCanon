"use client";

import { useState, useTransition } from "react";
import { removeMemberAction } from "./actions";

export type RemoveMemberConfirmProps = {
  targetUserId: string;
  targetDisplayName: string;
  onClose: () => void;
  onSuccess: () => void;
};

export function RemoveMemberConfirm({
  targetUserId,
  targetDisplayName,
  onClose,
  onSuccess,
}: RemoveMemberConfirmProps) {
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function confirm() {
    setError(null);
    startTransition(async () => {
      const result = await removeMemberAction({ targetUserId });
      if (result.ok) {
        onSuccess();
      } else {
        setError(result.error);
      }
    });
  }

  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center p-6">
      <div onClick={onClose} className="absolute inset-0 bg-black/70 backdrop-blur-[3px]" />
      <div className="relative w-full max-w-[440px] rounded-card border border-border-2 bg-panel p-6 shadow-heavy">
        <p className="font-display text-[17px] font-semibold">
          Remove {targetDisplayName} from this team?
        </p>
        <p className="mt-2.5 text-[13px] leading-relaxed text-dim">
          They&apos;ll be unassigned — not deactivated — and won&apos;t be able to
          authenticate with any API key they hold until an admin assigns them to a team
          again.
        </p>
        {error ? (
          <div className="mt-3 rounded-card border border-red/30 bg-red-soft p-3 text-[12px] text-red">
            {error}
          </div>
        ) : null}
        <div className="mt-5 flex justify-end gap-2.5">
          <button
            type="button"
            onClick={onClose}
            className="rounded-control border border-border-2 bg-surface px-4 py-2.5 text-[13px] font-semibold text-text"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={isPending}
            onClick={confirm}
            className="rounded-control bg-red px-4.5 py-2.5 text-[13px] font-semibold text-white disabled:opacity-50"
          >
            {isPending ? "Removing…" : "Remove member"}
          </button>
        </div>
      </div>
    </div>
  );
}
