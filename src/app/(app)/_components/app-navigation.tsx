"use client";

import type { SVGProps } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { getActiveNavKey, getNavigation, type NavKey } from "./nav-model";

type NavigationListProps = {
  pathname: string;
  teamId: string;
};

const iconPaths: Record<NavKey, string> = {
  overview: "M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h6v6h-6z",
  prompts: "M5 4h14v12H9l-4 4V4zM8 8h8M8 12h6",
  governance: "M12 3l8 4v5c0 5-3.4 8-8 9-4.6-1-8-4-8-9V7l8-4zM9 12l2 2 4-4",
  teams:
    "M8 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM2 21v-2a5 5 0 0 1 5-5h2a5 5 0 0 1 5 5v2M16 4a4 4 0 0 1 0 8M17 14a5 5 0 0 1 5 5v2",
  projects: "M3 7h7l2 2h9v11H3V7zM3 7V4h7l2 3",
  metrics: "M4 20V10M10 20V4M16 20v-7M22 20H2",
  apiKeys: "M14 8a5 5 0 1 1-2 4l2 2h3v3h3v3h2v-4l-8-8zM7 9h.01",
  auditLog: "M6 3h12v18H6zM9 8h6M9 12h6M9 16h4",
};

function NavIcon({
  navKey,
  ...props
}: SVGProps<SVGSVGElement> & { navKey: NavKey }) {
  return (
    <svg
      aria-hidden="true"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="1.7"
      {...props}
    >
      <path d={iconPaths[navKey]} />
    </svg>
  );
}

export function NavigationList({ pathname, teamId }: NavigationListProps) {
  const activeKey = getActiveNavKey(pathname);

  return (
    <nav aria-label="Primary" className="flex-1 px-3 py-4">
      {getNavigation(teamId).map((section) => (
        <section
          aria-labelledby={`nav-${section.label.toLowerCase()}`}
          className="mb-5"
          key={section.label}
        >
          <h2
            className="mb-2 px-2 font-mono text-[10px] font-semibold uppercase tracking-[0.16em] text-faint"
            id={`nav-${section.label.toLowerCase()}`}
          >
            {section.label}
          </h2>
          <ul className="m-0 list-none p-0">
            {section.items.map((item) => {
              const isActive = item.key === activeKey;
              return (
                <li key={item.key}>
                  <Link
                    href={item.href}
                    aria-current={isActive ? "page" : undefined}
                    className={[
                      "relative my-0.5 flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-[12px] font-medium outline-none transition-colors",
                      "focus-visible:ring-2 focus-visible:ring-a focus-visible:ring-offset-2 focus-visible:ring-offset-panel",
                      isActive
                        ? "bg-a-soft text-text before:absolute before:inset-y-2 before:left-0 before:w-[3px] before:rounded-r before:bg-a"
                        : "text-dim hover:bg-surface hover:text-text",
                    ].join(" ")}
                  >
                    <NavIcon
                      className={
                        isActive
                          ? "size-[17px] shrink-0 text-a"
                          : "size-[17px] shrink-0"
                      }
                      navKey={item.key}
                    />
                    <span>{item.label}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </nav>
  );
}

export function AppNavigation({ teamId }: { teamId: string }) {
  return <NavigationList pathname={usePathname()} teamId={teamId} />;
}
