import { redirect } from "next/navigation";
import {
  countLocalPoliciesAndObjectives,
  resolveEffectiveObjectives,
  resolveEffectiveObjectivesForTeam,
  resolveEffectivePolicies,
  resolveEffectivePoliciesForTeam,
} from "@/bcs/governance";
import { authenticateSession, listTeams, listUsers, type AppSessionUser } from "@/bcs/identity-access";
import { authDb, db, withTenantContext } from "@/shared/db";
import { buildScopeRows, type Scope } from "./scope-tree-data";

export async function loadGovernancePageData(teamId: string, person: string | undefined, cookieHeader: string | null) {
  const user = await authenticateSession(authDb, cookieHeader);
  if (!user) {
    redirect("/login");
  }
  return loadForUser(user, teamId, person);
}

async function loadForUser(user: AppSessionUser, teamId: string, person: string | undefined) {
  return withTenantContext(db, user.orgId, async (tx) => {
    const actor = { organizationId: user.orgId, userId: user.id };
    const [teams, users] = await Promise.all([listTeams(tx, user.orgId), listUsers(tx, user)]);

    const scopePerson = person ? users.find((u) => u.id === person) : undefined;
    const scope: Scope =
      person && scopePerson
        ? { kind: "person", userId: scopePerson.id, teamId: scopePerson.teamId, label: scopePerson.displayName }
        : { kind: "team", teamId, label: teams.find((t) => t.id === teamId)?.name ?? teamId };

    const [policies, objectives, counts] = await Promise.all([
      scope.kind === "team"
        ? resolveEffectivePoliciesForTeam(tx, actor, scope.teamId)
        : resolveEffectivePolicies(tx, actor, scope.userId),
      scope.kind === "team"
        ? resolveEffectiveObjectivesForTeam(tx, actor, scope.teamId)
        : resolveEffectiveObjectives(tx, actor, scope.userId),
      (async () => {
        const map = new Map<string, number>();
        await Promise.all([
          ...teams.map(async (team) => {
            const count = await countLocalPoliciesAndObjectives(tx, actor, { type: "team", id: team.id });
            map.set(`team:${team.id}`, count.total);
          }),
          ...users.map(async (u) => {
            const count = await countLocalPoliciesAndObjectives(tx, actor, { type: "user", id: u.id });
            map.set(`user:${u.id}`, count.total);
          }),
        ]);
        return map;
      })(),
    ]);

    const rows = buildScopeRows(teams, users, (rowScope) =>
      rowScope.kind === "team"
        ? (counts.get(`team:${rowScope.teamId}`) ?? 0)
        : (counts.get(`user:${rowScope.userId}`) ?? 0),
    );

    return { teams, scope, policies, objectives, rows };
  });
}
