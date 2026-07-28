import type { AppSessionUser } from "@/bcs/identity-access";

export type AccountIdentity = Pick<
  AppSessionUser,
  "displayName" | "role" | "teamName"
>;

export function AccountFooter({ user }: { user: AccountIdentity }) {
  const initial = user.displayName.trim().charAt(0).toUpperCase() || "?";
  const role =
    user.role.charAt(0).toUpperCase() + user.role.slice(1).toLowerCase();
  const teamLabel = user.teamName ?? "Unassigned";

  return (
    <footer className="flex items-center gap-2.5 border-t border-border px-4 py-3.5">
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
        className="size-4 shrink-0 text-faint"
        fill="none"
        viewBox="0 0 20 20"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.6"
      >
        <path d="m7 8 3 3 3-3" />
      </svg>
    </footer>
  );
}
