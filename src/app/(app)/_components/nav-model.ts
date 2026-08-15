export type NavKey =
  | "overview"
  | "prompts"
  | "governance"
  | "teams"
  | "projects"
  | "metrics"
  | "apiKeys"
  | "auditLog";

export type NavItem = {
  key: NavKey;
  label: string;
  href: string;
};

export type NavSection = {
  label: "Workspace" | "Settings";
  items: NavItem[];
};

const governanceRoutePattern =
  /^\/teams\/[^/]+\/(?:policies|objectives)(?:\/|$)/;

const directRoutes: ReadonlyArray<readonly [string, NavKey]> = [
  ["/dashboard", "overview"],
  ["/prompts", "prompts"],
  ["/teams", "teams"],
  ["/projects", "projects"],
  ["/metrics", "metrics"],
  ["/settings/api-keys", "apiKeys"],
  ["/settings/audit-log", "auditLog"],
];

export function getNavigation(teamId: string): NavSection[] {
  return [
    {
      label: "Workspace",
      items: [
        { key: "overview", label: "Overview", href: "/dashboard" },
        { key: "prompts", label: "Skills", href: "/prompts" },
        { key: "teams", label: "Teams", href: "/teams" },
        {
          key: "governance",
          label: "Governance",
          href: `/teams/${teamId}/policies`,
        },
        { key: "projects", label: "Projects", href: "/projects" },
        { key: "metrics", label: "Metrics", href: "/metrics" },
      ],
    },
    {
      label: "Settings",
      items: [
        { key: "apiKeys", label: "API keys", href: "/settings/api-keys" },
        {
          key: "auditLog",
          label: "Audit log",
          href: "/settings/audit-log",
        },
      ],
    },
  ];
}

function isSegment(pathname: string, route: string) {
  return pathname === route || pathname.startsWith(`${route}/`);
}

export function getActiveNavKey(pathname: string): NavKey | null {
  if (governanceRoutePattern.test(pathname)) {
    return "governance";
  }

  return (
    directRoutes.find(([route]) => isSegment(pathname, route))?.[1] ?? null
  );
}
