import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { authenticateSession, listInvitations, listTeams, listUsers } from "@/bcs/identity-access";
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

  const { teams, users, invitations } = await withTenantContext(db, user.orgId, async (tx) => {
    const [teams, users, invitations] = await Promise.all([
      listTeams(tx, user.orgId),
      listUsers(tx, user),
      // Listing invitations is admin-only; everyone else just sees no pending list.
      user.role === "admin" ? listInvitations(tx, user) : Promise.resolve([]),
    ]);
    return { teams, users, invitations };
  });

  const nameById = new Map(users.map((u) => [u.id, u.displayName]));
  const pending = invitations
    .filter((i) => i.state === "pending")
    .map((i) => ({
      id: i.id,
      email: i.email,
      teamId: i.teamId,
      role: i.role,
      invitedBy: nameById.get(i.invitedById) ?? "Unknown",
      expiresAt: i.expiresAt.toISOString().slice(0, 10),
    }));

  return (
    <TeamsExplorer
      currentUser={user}
      teams={teams}
      users={users}
      pendingInvitations={pending}
      initialSelectedTeamId={user.teamId}
    />
  );
}
