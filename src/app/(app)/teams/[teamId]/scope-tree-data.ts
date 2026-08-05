import type { Team, UserAccountSummary } from "@/bcs/identity-access";

export type Scope =
  | { kind: "team"; teamId: string; label: string }
  | { kind: "person"; userId: string; teamId: string | null; label: string };

export function scopeKey(scope: Scope): string {
  return scope.kind === "team" ? `team:${scope.teamId}` : `person:${scope.userId}`;
}

export function chainRootFirst(teamId: string, byId: Map<string, Team>): Team[] {
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
 * own children, then its own members, before the next sibling) — same
 * correctness property as teams-explorer.tsx's treeOrder, extended to
 * interleave person leaf-nodes under their team rather than teams only.
 * NOT a flat alphabetical sort across the whole org (see that file's
 * documented bug history).
 */
export interface ScopeRow {
  scope: Scope;
  depth: number;
  localCount: number;
}

export function buildScopeRows(
  teams: Team[],
  users: UserAccountSummary[],
  countFor: (scope: Scope) => number,
): ScopeRow[] {
  const childrenOf = new Map<string | null, Team[]>();
  for (const team of teams) {
    const list = childrenOf.get(team.parentTeamId) ?? [];
    list.push(team);
    childrenOf.set(team.parentTeamId, list);
  }
  for (const list of childrenOf.values()) {
    list.sort((a, b) => a.name.localeCompare(b.name));
  }

  const usersByTeam = new Map<string, UserAccountSummary[]>();
  for (const user of users) {
    if (user.teamId === null) continue;
    const list = usersByTeam.get(user.teamId) ?? [];
    list.push(user);
    usersByTeam.set(user.teamId, list);
  }
  for (const list of usersByTeam.values()) {
    list.sort((a, b) => a.displayName.localeCompare(b.displayName));
  }

  const rows: ScopeRow[] = [];
  function visit(parentId: string | null, depth: number) {
    for (const team of childrenOf.get(parentId) ?? []) {
      const teamScope: Scope = { kind: "team", teamId: team.id, label: team.name };
      rows.push({ scope: teamScope, depth, localCount: countFor(teamScope) });
      for (const user of usersByTeam.get(team.id) ?? []) {
        const personScope: Scope = {
          kind: "person",
          userId: user.id,
          teamId: user.teamId,
          label: user.displayName,
        };
        rows.push({ scope: personScope, depth: depth + 1, localCount: countFor(personScope) });
      }
      visit(team.id, depth + 1);
    }
  }
  visit(null, 0);
  return rows;
}
