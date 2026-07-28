import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { authenticateSession, listTeams, listUsers } from "@/bcs/identity-access";
import { authDb, db, withTenantContext } from "@/shared/db";
import { TeamsExplorer } from "./teams-explorer";

export default async function TeamsPage() {
  const cookieHeader = (await headers()).get("cookie");
  const user = await authenticateSession(authDb, cookieHeader);

  if (!user) {
    redirect("/login");
  }
  if (user.teamId === null) {
    // The (app) layout already renders the unassigned notice for this case
    // before children ever mount — this is a defensive fallback only.
    redirect("/dashboard");
  }

  const { teams, users } = await withTenantContext(db, user.orgId, async (tx) => {
    const [teams, users] = await Promise.all([
      listTeams(tx, user.orgId),
      listUsers(tx, user),
    ]);
    return { teams, users };
  });

  return (
    <TeamsExplorer currentUser={user} teams={teams} users={users} initialSelectedTeamId={user.teamId} />
  );
}
