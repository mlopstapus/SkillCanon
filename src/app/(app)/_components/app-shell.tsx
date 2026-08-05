"use client";

import { useEffect, useState, type ReactNode } from "react";
import { LogoMark, Wordmark } from "@/shared/ui";
import { AccountFooter, type AccountIdentity } from "./account-footer";

type AppShellProps = {
  children: ReactNode;
  navigation?: ReactNode;
  user: AccountIdentity;
};

const NAV_ID = "app-shell-nav";

function MenuIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" className="size-5">
      <path d="M3 5.5h14M3 10h14M3 14.5h14" />
    </svg>
  );
}

export function AppShell({ children, navigation, user }: AppShellProps) {
  const [navOpen, setNavOpen] = useState(false);

  // Off-canvas nav is a disclosure, not a modal dialog (no focus trap) — Escape
  // still closes it since it's a real interactive overlay a keyboard user can
  // otherwise get stuck behind on mobile.
  useEffect(() => {
    if (!navOpen) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setNavOpen(false);
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [navOpen]);

  return (
    <div className="grid min-h-screen grid-cols-1 bg-bg text-text md:grid-cols-[216px_minmax(0,1fr)]">
      <div className="sticky top-0 z-[90] flex h-14 items-center gap-2.5 border-b border-border bg-panel px-4 md:hidden">
        <button
          type="button"
          onClick={() => setNavOpen(true)}
          aria-label="Open navigation"
          aria-expanded={navOpen}
          aria-controls={NAV_ID}
          className="-ml-1.5 grid size-8 place-items-center rounded-control text-dim"
        >
          <MenuIcon />
        </button>
        <LogoMark size={22} />
        <Wordmark className="text-[14px]" />
      </div>

      {navOpen ? (
        <div
          aria-hidden="true"
          onClick={() => setNavOpen(false)}
          className="fixed inset-0 z-[100] bg-black/60 backdrop-blur-[2px] md:hidden"
        />
      ) : null}

      <aside
        id={NAV_ID}
        className={`${navOpen ? "flex" : "hidden"} fixed inset-y-0 left-0 z-[105] w-[248px] max-w-[85vw] flex-col border-r border-border bg-panel md:sticky md:top-0 md:z-auto md:flex md:h-screen md:w-auto md:max-w-none`}
      >
        <div className="flex min-h-14 items-center justify-between gap-2.5 border-b border-border px-5">
          <div className="flex items-center gap-2.5">
            <LogoMark size={26} />
            <Wordmark className="text-[16px]" />
          </div>
          <button
            type="button"
            onClick={() => setNavOpen(false)}
            aria-label="Close navigation"
            className="grid size-7.5 place-items-center rounded-control border border-border text-dim md:hidden"
          >
            ×
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto" onClick={() => setNavOpen(false)}>
          {navigation}
        </div>
        <AccountFooter user={user} />
      </aside>

      <div className="min-w-0">{children}</div>
    </div>
  );
}
