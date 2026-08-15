"use client";

import { useId, useState, useTransition } from "react";
import type { Team, UserAccountSummary } from "@/bcs/identity-access";
import { Drawer } from "@/shared/ui";
import { createTeamAction, insertTeamBetweenAction, updateTeamAction } from "./actions";

export type TeamFormMode = "new" | "edit" | "sub" | "insert";

export type TeamFormDrawerProps = {
  mode: TeamFormMode;
  /** The team being edited (mode="edit"), or the team the action is relative to (mode="sub"/"insert"). */
  contextTeam: Team | null;
  teams: Team[];
  users: UserAccountSummary[];
  onClose: () => void;
  onSuccess: () => void;
};

const TITLES: Record<TeamFormMode, string> = {
  new: "New team",
  edit: "Edit team",
  sub: "New sub-team",
  insert: "Insert team above",
};

const ACTION_LABELS: Record<TeamFormMode, string> = {
  new: "Create team",
  edit: "Save changes",
  sub: "Create team",
  insert: "Insert team",
};

export function TeamFormDrawer({
  mode,
  contextTeam,
  teams,
  users,
  onClose,
  onSuccess,
}: TeamFormDrawerProps) {
  const titleId = useId();
  const [name, setName] = useState(mode === "edit" ? (contextTeam?.name ?? "") : "");
  const [slug, setSlug] = useState(mode === "edit" ? (contextTeam?.slug ?? "") : "");
  const [description, setDescription] = useState(
    mode === "edit" ? (contextTeam?.description ?? "") : "",
  );
  const [ownerId, setOwnerId] = useState(
    mode === "edit" ? (contextTeam?.ownerId ?? "") : "",
  );
  const [parentTeamId, setParentTeamId] = useState(
    mode === "edit" ? (contextTeam?.parentTeamId ?? "") : "",
  );
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const ownerOptions = users.filter((u) =>
    mode === "edit" || mode === "sub" ? u.teamId === contextTeam?.id : true,
  );
  const parentOptions = teams.filter((t) => t.id !== contextTeam?.id);

  function submit() {
    setError(null);
    startTransition(async () => {
      const base = {
        name,
        slug,
        description: description || undefined,
        ownerId: ownerId || undefined,
      };

      const originalParentId = contextTeam?.parentTeamId ?? "";
      const parentChanged = parentTeamId !== "" && parentTeamId !== originalParentId;

      const result =
        mode === "new"
          ? await createTeamAction(base)
          : mode === "sub"
            ? await createTeamAction({ ...base, parentTeamId: contextTeam?.id })
            : mode === "insert"
              ? await insertTeamBetweenAction({ ...base, childTeamId: contextTeam!.id })
              : await updateTeamAction({
                  ...base,
                  teamId: contextTeam!.id,
                  newParentTeamId: parentChanged ? parentTeamId : undefined,
                });

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
          <span id={titleId} className="font-display text-[15px] font-semibold">{TITLES[mode]}</span>
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
          {mode === "insert" && contextTeam ? (
            <div className="rounded-card border border-a/25 bg-a-soft p-3.5 text-[11.5px] leading-relaxed text-dim">
              This new team slots in between <span className="text-text">{contextTeam.name}</span>{" "}
              and its current parent — {contextTeam.name} is reparented underneath it.
            </div>
          ) : null}
          {error ? (
            <div className="rounded-card border border-red/30 bg-red-soft p-3 text-[12px] text-red">
              {error}
            </div>
          ) : null}
          <label className="flex flex-col gap-1.5">
            <span className="text-[12px] font-semibold text-dim">Name</span>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Data Platform"
              className="rounded-control border border-border-2 bg-surface px-3 py-2.5 text-[13px] text-text outline-none focus:border-a"
            />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-[12px] font-semibold text-dim">Slug</span>
            <div className="flex items-center gap-2 rounded-control border border-border-2 bg-surface px-3">
              <span className="font-mono text-[13px] text-faint">@</span>
              <input
                value={slug}
                onChange={(e) => setSlug(e.target.value)}
                placeholder="data-platform"
                className="flex-1 bg-transparent py-2.5 font-mono text-[13px] text-text outline-none"
              />
            </div>
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-[12px] font-semibold text-dim">Description</span>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              placeholder="What this team owns…"
              className="resize-y rounded-control border border-border-2 bg-surface px-3 py-2.5 text-[13px] text-text outline-none focus:border-a"
            />
          </label>
          {mode === "edit" ? (
            <label className="flex flex-col gap-1.5">
              <span className="text-[12px] font-semibold text-dim">Parent team</span>
              <select
                value={parentTeamId}
                onChange={(e) => setParentTeamId(e.target.value)}
                className="rounded-control border border-border-2 bg-surface px-3 py-2.5 text-[13px] text-text outline-none"
              >
                {contextTeam?.parentTeamId === null ? (
                  <option value="">— (root — moving to root isn&apos;t supported yet)</option>
                ) : null}
                {parentOptions.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
          <label className="flex flex-col gap-1.5">
            <span className="text-[12px] font-semibold text-dim">Owner</span>
            <select
              value={ownerId}
              onChange={(e) => setOwnerId(e.target.value)}
              className="rounded-control border border-border-2 bg-surface px-3 py-2.5 text-[13px] text-text outline-none"
            >
              <option value="">—</option>
              {ownerOptions.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.displayName}
                </option>
              ))}
            </select>
            <span className="text-[11px] leading-relaxed text-faint">
              An administrative role — this does not add them as a team member. Use
              &quot;+ add member&quot; on the team&apos;s Members tab for that.
            </span>
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
            disabled={isPending || !name || !slug}
            onClick={submit}
            className="rounded-control bg-a px-4.5 py-2.5 text-[13px] font-semibold text-a-fg shadow-glow disabled:opacity-50"
          >
            {isPending ? "Saving…" : ACTION_LABELS[mode]}
          </button>
        </div>
    </Drawer>
  );
}
