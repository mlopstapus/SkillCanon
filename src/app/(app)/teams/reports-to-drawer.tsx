"use client";

import { useId, useState, useTransition } from "react";
import type { UserAccountSummary } from "@/bcs/identity-access";
import { Drawer } from "@/shared/ui";
import { setManagerAction } from "./actions";

export type ReportsToDrawerProps = {
  target: UserAccountSummary;
  /** Everyone in the org; the person themself is left out of the choices. */
  users: UserAccountSummary[];
  onClose: () => void;
  onSuccess: () => void;
};

/** Sets or clears who a person reports to (019/002). Teams and policy inheritance are unaffected. */
export function ReportsToDrawer({ target, users, onClose, onSuccess }: ReportsToDrawerProps) {
  const titleId = useId();
  const [managerId, setManagerId] = useState(target.managerId ?? "");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const choices = users.filter((u) => u.id !== target.id).sort((a, b) => a.displayName.localeCompare(b.displayName));

  function save() {
    setError(null);
    startTransition(async () => {
      const result = await setManagerAction({ targetUserId: target.id, managerId: managerId || null });
      if (result.ok) {
        onSuccess();
      } else {
        setError(result.error);
      }
    });
  }

  return (
    <Drawer onClose={onClose} labelledBy={titleId} widthClassName="w-[452px]">
      <div className="flex h-14 items-center justify-between border-b border-border px-5">
        <span id={titleId} className="font-display text-[15px] font-semibold">
          Reports to
        </span>
        <button type="button" onClick={onClose} aria-label="Close" className="grid size-7.5 place-items-center rounded-control border border-border text-dim">
          ×
        </button>
      </div>
      <div className="flex flex-1 flex-col gap-3 overflow-y-auto px-5.5 py-5">
        <p className="text-[12px] text-dim">
          Who <span className="text-text">{target.displayName}</span> reports to. This records the reporting line only; the team they belong to does not change.
        </p>
        <label className="flex flex-col gap-1.5 text-[12px] text-dim">
          Reports to
          <select
            value={managerId}
            onChange={(e) => setManagerId(e.target.value)}
            className="rounded-control border border-border-2 bg-surface px-3 py-2.5 text-[13px] text-text outline-none focus:border-a"
          >
            <option value="">No one</option>
            {choices.map((u) => (
              <option key={u.id} value={u.id}>
                {u.displayName} ({u.email})
              </option>
            ))}
          </select>
        </label>
        {error ? (
          <p role="alert" className="text-[12px] text-red">
            {error}
          </p>
        ) : null}
        <div className="mt-auto flex justify-end gap-2.5">
          <button type="button" onClick={onClose} className="rounded-control border border-border-2 bg-surface px-4 py-2.5 text-[13px] font-semibold text-text">
            Cancel
          </button>
          <button
            type="button"
            disabled={isPending}
            onClick={save}
            className="rounded-control bg-a px-4 py-2.5 text-[13px] font-bold text-a-fg disabled:opacity-50"
          >
            {isPending ? "Saving…" : "Save"}
          </button>
        </div>
      </div>
    </Drawer>
  );
}
