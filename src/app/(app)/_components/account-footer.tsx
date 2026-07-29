"use client";

import { useState } from "react";
import type { AppSessionUser } from "@/bcs/identity-access";
import { logoutAction } from "../logout-action";

export type AccountIdentity = Pick<
  AppSessionUser,
  "displayName" | "role" | "teamName"
>;

export function AccountFooter({ user }: { user: AccountIdentity }) {
  const [open, setOpen] = useState(false);
  const initial = user.displayName.trim().charAt(0).toUpperCase() || "?";
  const role =
    user.role.charAt(0).toUpperCase() + user.role.slice(1).toLowerCase();
  const teamLabel = user.teamName ?? "Unassigned";

  return (
    <footer className="border-t border-border">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label="Account menu"
        aria-expanded={open}
        className="flex w-full items-center gap-2.5 px-4 py-3.5 text-left"
      >
        <span
          aria-hidden="true"
          className="grid size-8 shrink-0 place-items-center rounded-full border border-a/25 bg-a-soft font-display text-[12px] font-semibold text-a"
        >
          {initial}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[12px] font-semibold text-text">
            {user.displayName}
          </span>
          <span className="mt-0.5 block truncate text-[10.5px] text-faint">
            {role} · {teamLabel}
          </span>
        </span>
        <svg
          aria-hidden="true"
          className={`size-4 shrink-0 text-faint transition-transform ${open ? "rotate-180" : ""}`}
          fill="none"
          viewBox="0 0 20 20"
          stroke="currentColor"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="1.6"
        >
          <path d="m7 8 3 3 3-3" />
        </svg>
      </button>
      {/* Always rendered (visibility toggled by class, not unmounted) so it's
          present in server-rendered markup regardless of open state. */}
      <div className={open ? "border-t border-border px-2 py-1.5" : "hidden"}>
        <form action={logoutAction}>
          <button
            type="submit"
            className="w-full rounded-control px-2.5 py-2 text-left text-[12px] font-medium text-red hover:bg-red-soft"
          >
            Log out
          </button>
        </form>
      </div>
    </footer>
  );
}
