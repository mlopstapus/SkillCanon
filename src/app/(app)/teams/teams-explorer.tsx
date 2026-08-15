"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { AppSessionUser, Team, UserAccountSummary } from "@/bcs/identity-access";
import { AppState, Badge } from "@/shared/ui";
import { AddMemberDrawer } from "./add-member-drawer";
import { InviteMemberDrawer } from "./invite-member-drawer";
import { RemoveMemberConfirm } from "./remove-member-confirm";
import { TeamFormDrawer, type TeamFormMode } from "./team-form-drawer";
import { UnassignedUsersPanel } from "./unassigned-users-panel";

type Tab = "details" | "subteams" | "members";
type SidebarView = "team" | "unassigned";

type DrawerState = { mode: TeamFormMode; contextTeam: Team | null };

export type TeamsExplorerProps = {
  currentUser: AppSessionUser;
  teams: Team[];
  users: UserAccountSummary[];
  initialSelectedTeamId: string;
};

type TeamsExplorerViewProps = TeamsExplorerProps & {
  /** Injected rather than calling `useRouter()` internally, so this pure view can render outside an App Router context (e.g. `renderToStaticMarkup` in tests) — mirrors `app-navigation.tsx`'s `NavigationList`/`AppNavigation` split. */
  refresh: () => void;
};

function depthOf(teamId: string, byId: Map<string, Team>): number {
  let depth = 0;
  let current = byId.get(teamId);
  while (current?.parentTeamId) {
    depth += 1;
    current = byId.get(current.parentTeamId);
  }
  return depth;
}

function chainRootFirst(teamId: string, byId: Map<string, Team>): Team[] {
  const chain: Team[] = [];
  let current = byId.get(teamId);
  while (current) {
    chain.unshift(current);
    current = current.parentTeamId ? byId.get(current.parentTeamId) : undefined;
  }
  return chain;
}

/**
 * Depth-first tree order (root-first, each team immediately followed by its
 * own children before moving to the next sibling) — NOT a flat alphabetical
 * sort across the whole org, which would scatter a parent from its children
 * whenever an unrelated team's name happened to sort between them. Siblings
 * are still ordered alphabetically among themselves. Caught via manual
 * browser verification (quickstart.md), not by any structural test — those
 * fixtures only ever had one branch, never enough siblings for the bug to
 * surface.
 */
function treeOrder(teams: Team[]): Team[] {
  const childrenOf = new Map<string | null, Team[]>();
  for (const team of teams) {
    const list = childrenOf.get(team.parentTeamId) ?? [];
    list.push(team);
    childrenOf.set(team.parentTeamId, list);
  }
  for (const list of childrenOf.values()) {
    list.sort((a, b) => a.name.localeCompare(b.name));
  }

  const ordered: Team[] = [];
  function visit(parentId: string | null) {
    for (const team of childrenOf.get(parentId) ?? []) {
      ordered.push(team);
      visit(team.id);
    }
  }
  visit(null);
  return ordered;
}

function TeamsSidebar({
  teams,
  selectedTeamId,
  byId,
  membersByTeam,
  filterText,
  setFilterText,
  isAdmin,
  unassignedCount,
  sidebarView,
  onSelectTeam,
  onSelectUnassigned,
  onNewTeam,
}: {
  teams: Team[];
  selectedTeamId: string;
  byId: Map<string, Team>;
  membersByTeam: Map<string, UserAccountSummary[]>;
  filterText: string;
  setFilterText: (value: string) => void;
  isAdmin: boolean;
  unassignedCount: number;
  sidebarView: SidebarView;
  onSelectTeam: (teamId: string) => void;
  onSelectUnassigned: () => void;
  onNewTeam: () => void;
}) {
  const visibleTeams = treeOrder(teams).filter((t) =>
    filterText.trim().length === 0
      ? true
      : t.name.toLowerCase().includes(filterText.trim().toLowerCase()),
  );

  return (
    <aside className="flex flex-col border-r border-border bg-panel">
      <div className="flex h-14 items-center justify-between border-b border-border px-4">
        <span className="font-display text-[13.5px] font-semibold">Teams</span>
        <span className="rounded-control border border-border px-1.5 py-0.5 font-mono text-[10.5px] text-faint">
          {teams.length} total
        </span>
      </div>
      <div className="px-3.5 pt-3 pb-2">
        <input
          aria-label="Filter teams"
          placeholder="Filter teams"
          value={filterText}
          onChange={(e) => setFilterText(e.target.value)}
          className="w-full rounded-control border border-border bg-surface px-2.5 py-1.5 text-[12.5px] text-text outline-none focus:border-a"
        />
      </div>
      {isAdmin ? (
        <button
          type="button"
          onClick={onSelectUnassigned}
          className={`mx-2 mb-1 flex items-center gap-2 rounded-control border py-1.5 px-2.5 text-left text-[12.5px] font-medium ${
            sidebarView === "unassigned"
              ? "border-a/40 bg-a-soft text-text"
              : "border-transparent text-dim hover:bg-surface"
          }`}
        >
          <span className="min-w-0 flex-1">Unassigned</span>
          <span className="rounded-control border border-border bg-surface-2 px-1.5 py-0.5 font-mono text-[10px] text-dim">
            {unassignedCount}
          </span>
        </button>
      ) : null}
      <nav className="flex-1 overflow-y-auto px-2 pb-3" aria-label="Team hierarchy">
        {visibleTeams.map((team) => {
          const selected = sidebarView === "team" && team.id === selectedTeamId;
          const memberCount = (membersByTeam.get(team.id) ?? []).length;
          return (
            <button
              key={team.id}
              type="button"
              onClick={() => onSelectTeam(team.id)}
              style={{ paddingLeft: 10 + depthOf(team.id, byId) * 15 }}
              className={`mb-0.5 flex w-full items-center gap-2 rounded-control border py-1.5 pr-2.5 text-left text-[12.5px] font-medium transition ${
                selected
                  ? "border-a/40 bg-a-soft text-text"
                  : "border-transparent text-dim hover:bg-surface"
              }`}
            >
              <span className="min-w-0 flex-1 truncate">{team.name}</span>
              <span className="rounded-control border border-border bg-surface-2 px-1.5 py-0.5 font-mono text-[10px] text-dim">
                {memberCount}
              </span>
            </button>
          );
        })}
      </nav>
      {isAdmin ? (
        <div className="border-t border-border p-3.5">
          <button
            type="button"
            onClick={onNewTeam}
            className="flex w-full items-center justify-center gap-1.5 rounded-control border border-border-2 bg-surface py-2.5 text-[12.5px] font-semibold text-dim"
          >
            + New team
          </button>
        </div>
      ) : null}
    </aside>
  );
}

export function TeamsExplorerView({
  currentUser,
  teams,
  users,
  initialSelectedTeamId,
  refresh,
}: TeamsExplorerViewProps) {
  const [selectedTeamId, setSelectedTeamId] = useState(initialSelectedTeamId);
  const [tab, setTab] = useState<Tab>("details");
  const [filterText, setFilterText] = useState("");
  const [drawer, setDrawer] = useState<DrawerState | null>(null);
  const [sidebarView, setSidebarView] = useState<SidebarView>("team");
  const [inviteOpen, setInviteOpen] = useState(false);
  const [addMemberOpen, setAddMemberOpen] = useState(false);
  const [removeTarget, setRemoveTarget] = useState<UserAccountSummary | null>(null);

  function closeDrawer() {
    setDrawer(null);
  }

  function onDrawerSuccess() {
    setDrawer(null);
    refresh();
  }

  function onInviteSuccess() {
    setInviteOpen(false);
    refresh();
  }

  function onAddMemberSuccess() {
    refresh();
  }

  function onRemoveSuccess() {
    setRemoveTarget(null);
    refresh();
  }

  function onAssignedSuccess() {
    refresh();
  }

  const byId = useMemo(() => new Map(teams.map((t) => [t.id, t])), [teams]);
  const membersByTeam = useMemo(() => {
    const map = new Map<string, UserAccountSummary[]>();
    for (const u of users) {
      if (u.teamId === null) continue;
      const list = map.get(u.teamId) ?? [];
      list.push(u);
      map.set(u.teamId, list);
    }
    return map;
  }, [users]);

  const selectedTeam = byId.get(selectedTeamId) ?? teams[0];
  const isAdmin = currentUser.role === "admin";
  const unassignedUsers = useMemo(() => users.filter((u) => u.teamId === null), [users]);

  const sidebar = (
    <TeamsSidebar
      teams={teams}
      selectedTeamId={selectedTeamId}
      byId={byId}
      membersByTeam={membersByTeam}
      filterText={filterText}
      setFilterText={setFilterText}
      isAdmin={isAdmin}
      unassignedCount={unassignedUsers.length}
      sidebarView={sidebarView}
      onSelectTeam={(id) => {
        setSelectedTeamId(id);
        setTab("details");
        setSidebarView("team");
      }}
      onSelectUnassigned={() => setSidebarView("unassigned")}
      onNewTeam={() => setDrawer({ mode: "new", contextTeam: null })}
    />
  );

  if (sidebarView === "unassigned" && isAdmin) {
    return (
      <div className="grid min-h-full grid-cols-[280px_minmax(0,1fr)]">
        {sidebar}
        <main className="min-w-0 overflow-y-auto p-6">
          <UnassignedUsersPanel
            users={unassignedUsers}
            teams={teams}
            onAssigned={onAssignedSuccess}
          />
        </main>
      </div>
    );
  }

  if (!selectedTeam) {
    return (
      <div className="grid min-h-full grid-cols-[280px_minmax(0,1fr)]">
        {sidebar}
        <main className="p-8">
          <AppState
            variant="empty"
            title="No teams yet"
            description={
              isAdmin
                ? "Create your organization's first team to start assigning members and governance."
                : "No teams exist in this organization yet. An admin needs to create one."
            }
            action={
              isAdmin ? (
                <button
                  type="button"
                  onClick={() => setDrawer({ mode: "new", contextTeam: null })}
                  className="rounded-cta bg-a px-3.5 py-2 text-[13px] font-semibold text-a-fg"
                >
                  New team
                </button>
              ) : undefined
            }
          />
        </main>
      </div>
    );
  }

  const children = teams.filter((t) => t.parentTeamId === selectedTeam.id);
  const members = membersByTeam.get(selectedTeam.id) ?? [];
  const breadcrumb = chainRootFirst(selectedTeam.id, byId);
  const ownerUser = selectedTeam.ownerId
    ? users.find((u) => u.id === selectedTeam.ownerId)
    : undefined;
  const canManageMembers = isAdmin || selectedTeam.ownerId === currentUser.id;
  const addMemberCandidates = users.filter((u) => u.teamId !== selectedTeam.id);

  return (
    <div className="grid min-h-full grid-cols-[280px_minmax(0,1fr)]">
      {sidebar}

      <main className="flex min-w-0 flex-col overflow-hidden">
        <div className="border-b border-border bg-bg px-6 pt-3.5">
          <div className="flex items-start justify-between gap-3.5">
            <div className="min-w-0">
              <p className="mb-2 font-mono text-[10.5px] uppercase tracking-[0.12em] text-faint">
                Team settings
              </p>
              <div className="flex items-center gap-2.5">
                <span className="grid size-8 place-items-center rounded-tile bg-gradient-to-br from-a to-a-2 font-mono text-[13px] font-semibold text-a-fg shadow-glow">
                  {selectedTeam.name.charAt(0).toUpperCase()}
                </span>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-display text-[19px] font-bold tracking-tight">
                      {selectedTeam.name}
                    </span>
                    <span className="rounded-pill border border-border-2 px-2 py-0.5 font-mono text-[10.5px] text-dim">
                      @{selectedTeam.slug}
                    </span>
                  </div>
                  <div
                    className="mt-0.5 font-mono text-[11px] text-faint"
                    data-testid="team-breadcrumb"
                  >
                    {breadcrumb.map((t) => t.name).join("   ›   ")}
                  </div>
                </div>
              </div>
            </div>
            {isAdmin ? (
              <div className="flex flex-none flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => setDrawer({ mode: "insert", contextTeam: selectedTeam })}
                  className="rounded-control border border-border-2 bg-surface px-2.5 py-2 font-mono text-[11.5px] text-dim"
                >
                  Insert above
                </button>
                <button
                  type="button"
                  onClick={() => setDrawer({ mode: "edit", contextTeam: selectedTeam })}
                  className="rounded-control border border-border-2 bg-surface px-2.5 py-2 font-mono text-[11.5px] text-dim"
                >
                  Edit
                </button>
                <button
                  type="button"
                  onClick={() => setDrawer({ mode: "sub", contextTeam: selectedTeam })}
                  className="rounded-control bg-a px-3.5 py-2 text-[13px] font-semibold text-a-fg shadow-glow"
                >
                  New sub-team
                </button>
              </div>
            ) : null}
          </div>
          <div className="mt-4 flex gap-0.5">
            <button
              type="button"
              onClick={() => setTab("details")}
              className={`px-3.5 py-2.5 text-[13.5px] font-semibold ${tab === "details" ? "border-b-2 border-a text-text" : "border-b-2 border-transparent text-faint"}`}
            >
              Details
            </button>
            <button
              type="button"
              onClick={() => setTab("subteams")}
              className={`flex items-center gap-2 px-3.5 py-2.5 text-[13.5px] font-semibold ${tab === "subteams" ? "border-b-2 border-a text-text" : "border-b-2 border-transparent text-faint"}`}
            >
              Sub-teams
              <span className="rounded-control border border-border bg-surface px-1.5 py-0.5 font-mono text-[10.5px] text-faint">
                {children.length}
              </span>
            </button>
            <button
              type="button"
              onClick={() => setTab("members")}
              className={`flex items-center gap-2 px-3.5 py-2.5 text-[13.5px] font-semibold ${tab === "members" ? "border-b-2 border-a text-text" : "border-b-2 border-transparent text-faint"}`}
            >
              Members
              <span className="rounded-control border border-border bg-surface px-1.5 py-0.5 font-mono text-[10.5px] text-faint">
                {members.length}
              </span>
            </button>
          </div>
        </div>

        <div className="mx-auto w-full max-w-[900px] flex-1 overflow-y-auto px-6 py-6">
          {/* All three panels always render (visibility toggled by class, not
              unmounted) so their content is present in server-rendered
              markup regardless of which tab is active on the client. */}
          <div className={tab === "details" ? "flex flex-col gap-2.5" : "hidden"}>
            <dl className="grid grid-cols-[120px_1fr] gap-x-3.5 gap-y-2.5 rounded-card border border-border bg-surface p-4">
              <dt className="font-mono text-[11px] text-faint">Name</dt>
              <dd className="text-[13.5px] font-medium">{selectedTeam.name}</dd>
              <dt className="font-mono text-[11px] text-faint">Slug</dt>
              <dd className="font-mono text-[12.5px] text-dim">@{selectedTeam.slug}</dd>
              <dt className="font-mono text-[11px] text-faint">Description</dt>
              <dd className="text-[13px] leading-relaxed text-dim">
                {selectedTeam.description || "—"}
              </dd>
              <dt className="font-mono text-[11px] text-faint">Owner</dt>
              <dd className="text-[13px] font-medium">{ownerUser?.displayName ?? "—"}</dd>
              <dt className="font-mono text-[11px] text-faint">Parent</dt>
              <dd className="text-[13px]">
                {selectedTeam.parentTeamId
                  ? (byId.get(selectedTeam.parentTeamId)?.name ?? "—")
                  : "— (root)"}
              </dd>
              <dt className="font-mono text-[11px] text-faint">Created</dt>
              <dd className="font-mono text-[12px] text-dim">
                {new Date(selectedTeam.createdAt).toLocaleDateString()}
              </dd>
            </dl>
            <div className="mt-2 flex gap-2.5 rounded-card border border-a/25 bg-a-soft p-3.5">
              <p className="text-[11.5px] leading-relaxed text-dim">
                Governance policies at <span className="text-text">{selectedTeam.name}</span>{" "}
                and every team above cascade down to sub-teams and members automatically.
              </p>
            </div>
          </div>

          <div className={tab === "subteams" ? "flex flex-col gap-2.5" : "hidden"}>
            {children.length === 0 ? (
              <div role="status" className="rounded-card border border-dashed border-border-2 p-9 text-center">
                <p className="mb-1.5 font-display text-[15px] font-semibold">
                  No sub-teams under {selectedTeam.name}
                </p>
                <p className="mx-auto mb-4 max-w-[380px] text-[12.5px] leading-relaxed text-dim">
                  Split responsibilities by creating a sub-team — it inherits every policy
                  defined above it.
                </p>
                {isAdmin ? (
                  <button
                    type="button"
                    onClick={() => setDrawer({ mode: "sub", contextTeam: selectedTeam })}
                    className="inline-flex items-center gap-1.5 rounded-control bg-a px-3.5 py-2 font-semibold text-[12.5px] text-a-fg shadow-glow"
                  >
                    New sub-team
                  </button>
                ) : null}
              </div>
            ) : (
              children.map((t) => {
                const count = (membersByTeam.get(t.id) ?? []).length;
                const teamOwner = t.ownerId
                  ? users.find((u) => u.id === t.ownerId)
                  : undefined;
                return (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => {
                      setSelectedTeamId(t.id);
                      setTab("details");
                    }}
                    className="flex w-full items-center gap-3 rounded-card border border-border bg-surface p-3.5 text-left"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="text-[13.5px] font-semibold">{t.name}</div>
                      <div className="mt-0.5 font-mono text-[11px] text-faint">
                        @{t.slug} · owner {teamOwner?.displayName ?? "—"}
                      </div>
                    </div>
                    <span className="rounded-control border border-border bg-surface-2 px-2 py-0.5 font-mono text-[10.5px] text-dim">
                      {count} members
                    </span>
                  </button>
                );
              })
            )}
          </div>

          <div className={tab === "members" ? "flex flex-col gap-2.5" : "hidden"}>
            {canManageMembers ? (
              <div className="mb-1 flex justify-end gap-2">
                {isAdmin ? (
                  <button
                    type="button"
                    onClick={() => setAddMemberOpen(true)}
                    className="rounded-control border border-border-2 bg-transparent px-2.5 py-1.5 font-mono text-[11px] text-dim"
                  >
                    + add member
                  </button>
                ) : null}
                <button
                  type="button"
                  onClick={() => setInviteOpen(true)}
                  className="rounded-control border border-border-2 bg-transparent px-2.5 py-1.5 font-mono text-[11px] text-dim"
                >
                  + invite by email
                </button>
              </div>
            ) : null}
            {members.length === 0 ? (
              <p role="status" className="text-[12.5px] text-dim">No members on this team yet.</p>
            ) : (
              members.map((m) => (
                <div
                  key={m.id}
                  className="flex items-center gap-3 rounded-card border border-border bg-surface p-3"
                >
                  <span className="grid size-7 place-items-center rounded-full border border-border-2 bg-surface-2 font-mono text-[11px] text-a">
                    {m.displayName.charAt(0).toUpperCase()}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="text-[13px] font-semibold">{m.displayName}</div>
                    <div className="mt-0.5 font-mono text-[11px] text-faint">{m.email}</div>
                  </div>
                  <Badge variant={m.role === "admin" ? "accent" : "neutral"}>{m.role}</Badge>
                  {canManageMembers ? (
                    <button
                      type="button"
                      onClick={() => setRemoveTarget(m)}
                      aria-label={`Remove ${m.displayName}`}
                      className="grid size-7 place-items-center rounded-control border border-border text-dim"
                    >
                      ×
                    </button>
                  ) : null}
                </div>
              ))
            )}
          </div>
        </div>
      </main>

      {drawer ? (
        <TeamFormDrawer
          mode={drawer.mode}
          contextTeam={drawer.contextTeam}
          teams={teams}
          users={users}
          onClose={closeDrawer}
          onSuccess={onDrawerSuccess}
        />
      ) : null}

      {inviteOpen ? (
        <InviteMemberDrawer
          teamId={selectedTeam.id}
          teamName={selectedTeam.name}
          onClose={() => setInviteOpen(false)}
          onSuccess={onInviteSuccess}
        />
      ) : null}

      {addMemberOpen ? (
        <AddMemberDrawer
          teamId={selectedTeam.id}
          teamName={selectedTeam.name}
          candidateUsers={addMemberCandidates}
          teamsById={byId}
          onClose={() => setAddMemberOpen(false)}
          onSuccess={onAddMemberSuccess}
        />
      ) : null}

      {removeTarget ? (
        <RemoveMemberConfirm
          targetUserId={removeTarget.id}
          targetDisplayName={removeTarget.displayName}
          onClose={() => setRemoveTarget(null)}
          onSuccess={onRemoveSuccess}
        />
      ) : null}
    </div>
  );
}

export function TeamsExplorer(props: TeamsExplorerProps) {
  const router = useRouter();
  return <TeamsExplorerView {...props} refresh={() => router.refresh()} />;
}
