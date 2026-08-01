import { headers } from "next/headers";
import { redirect } from "next/navigation";
import {
  listProjectMembers,
  listProjectSkillAssignmentsForOrganization,
  listProjectsByOrganization,
} from "@/bcs/prompt-registry";
import { authenticateSession, listTeams, listUsers } from "@/bcs/identity-access";
import { authDb, db, withTenantContext } from "@/shared/db";
import { ProjectsList } from "./projects-list";
import type { ProjectListRow } from "./projects-list-view";

export default async function ProjectsPage() {
  const cookieHeader = (await headers()).get("cookie");
  const user = await authenticateSession(authDb, cookieHeader);

  if (!user) {
    redirect("/login");
  }

  const { rows, teamOptions, userOptions } = await withTenantContext(db, user.orgId, async (tx) => {
    const [projects, teams, users, assignments] = await Promise.all([
      listProjectsByOrganization(tx, user.orgId),
      listTeams(tx, user.orgId),
      listUsers(tx, user),
      listProjectSkillAssignmentsForOrganization(tx, user.orgId),
    ]);
    const teamNameById = new Map(teams.map((t) => [t.id, t.name]));
    const userNameById = new Map(users.map((u) => [u.id, u.displayName]));

    const rows: ProjectListRow[] = await Promise.all(
      projects.map(async (p) => {
        const members = await listProjectMembers(tx, user.orgId, p.id);
        return {
          id: p.id,
          name: p.name,
          description: p.description ?? "",
          teamLabel: teamNameById.get(p.teamId) ?? p.teamId,
          leadLabel: p.leadUserId ? (userNameById.get(p.leadUserId) ?? p.leadUserId) : null,
          memberCount: members.length,
          promptCount: assignments.filter((a) => a.projectId === p.id).length,
        };
      }),
    );

    return {
      rows: rows.sort((a, b) => a.name.localeCompare(b.name)),
      teamOptions: teams.map((t) => ({ id: t.id, name: t.name })),
      userOptions: users.map((u) => ({ id: u.id, name: u.displayName })),
    };
  });

  return <ProjectsList rows={rows} teamOptions={teamOptions} userOptions={userOptions} />;
}
