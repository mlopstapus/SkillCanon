import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import {
  getProject,
  getProjectMetrics,
  listProjectMembers,
  listProjectRepos,
  listProjectSkillAssignmentsForOrganization,
  listProjectTeams,
  listSkillsByOrganization,
  listVersions,
} from "@/bcs/prompt-registry";
import { authenticateSession, listTeams, listUsers } from "@/bcs/identity-access";
import { authDb, db, withTenantContext } from "@/shared/db";
import { ProjectDetail } from "./project-detail";
import type { ProjectDetailData } from "./project-detail-view";

export default async function ProjectDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const cookieHeader = (await headers()).get("cookie");
  const user = await authenticateSession(authDb, cookieHeader);

  if (!user) {
    redirect("/login");
  }

  const data = await withTenantContext(db, user.orgId, async (tx) => {
    const project = await getProject(tx, user.orgId, id);
    if (!project) {
      return null;
    }

    const actor = { organizationId: user.orgId, userId: user.id };
    const [members, collaboratorTeams, repos, allTeams, allUsers, assignments, allSkills, metrics] = await Promise.all([
      listProjectMembers(tx, user.orgId, id),
      listProjectTeams(tx, user.orgId, id),
      listProjectRepos(tx, user.orgId, id),
      listTeams(tx, user.orgId),
      listUsers(tx, user),
      listProjectSkillAssignmentsForOrganization(tx, user.orgId),
      listSkillsByOrganization(tx, user.orgId),
      getProjectMetrics(tx, user.orgId, id),
    ]);

    const teamNameById = new Map(allTeams.map((t) => [t.id, t.name]));
    const userNameById = new Map(allUsers.map((u) => [u.id, u.displayName]));
    const skillNameById = new Map(allSkills.map((s) => [s.id, s.name]));
    const participatingTeamIds = new Set([project.teamId, ...collaboratorTeams.map((t) => t.teamId)]);

    const eligibleSkills = allSkills.filter(
      (s) => s.ownerType === "team" && participatingTeamIds.has(s.ownerId),
    );
    const projectAssignmentsById = new Map(
      assignments.filter((a) => a.projectId === id).map((a) => [a.skillId, a.requirement]),
    );

    const skillRows = await Promise.all(
      eligibleSkills.map(async (s) => {
        const versions = await listVersions(tx, actor, s.name);
        const activeVersion = versions.find((v) => v.id === s.activeVersionId);
        return {
          id: s.id,
          name: s.name,
          description: s.description ?? "",
          activeVersion: activeVersion?.version ?? null,
          requirement: projectAssignmentsById.get(s.id) ?? null,
        };
      }),
    );

    const memberUserIds = new Set(members.map((m) => m.userId));

    const result: ProjectDetailData = {
      id: project.id,
      name: project.name,
      description: project.description ?? "",
      teamLabel: teamNameById.get(project.teamId) ?? project.teamId,
      leadLabel: project.leadUserId ? (userNameById.get(project.leadUserId) ?? project.leadUserId) : null,
      memberCount: members.length,
      teamCount: collaboratorTeams.length,
      repoCount: repos.length,
      promptCount: skillRows.filter((s) => s.requirement).length,
      members: members.map((m) => ({
        userId: m.userId,
        name: userNameById.get(m.userId) ?? m.userId,
        role: m.role,
      })),
      collaboratorTeams: collaboratorTeams.map((t) => ({ id: t.teamId, name: teamNameById.get(t.teamId) ?? t.teamId })),
      addableTeams: allTeams
        .filter((t) => !participatingTeamIds.has(t.id))
        .map((t) => ({ id: t.id, name: t.name })),
      addableUsers: allUsers
        .filter((u) => !memberUserIds.has(u.id))
        .map((u) => ({ id: u.id, name: u.displayName })),
      repos: repos.map((r) => ({ id: r.id, name: r.name, url: r.url, branch: r.branch })),
      requiredPrompts: skillRows.filter((s) => s.requirement === "required"),
      optionalPrompts: skillRows.filter((s) => s.requirement === "optional"),
      availablePrompts: skillRows.filter((s) => !s.requirement),
      metrics: {
        totalInvocations: metrics.totalInvocations,
        activeSkillCount: metrics.activeSkillCount,
        activeContributorCount: metrics.activeContributorCount,
        coverageLabel: metrics.coverageLabel,
        hasRequiredSkills: metrics.requiredSkillIds.length > 0,
        allClear: metrics.allClear,
        gapMembers: metrics.gapMembers.map((g) => ({
          userId: g.userId,
          name: userNameById.get(g.userId) ?? g.userId,
          missingSkillNames: g.missingSkillIds.map((skillId) => skillNameById.get(skillId) ?? skillId),
        })),
        trend: metrics.trend,
        trendSkills: metrics.bySkill.map((s) => ({ id: s.promptId, name: skillNameById.get(s.promptId) ?? s.promptId })),
        bySkill: metrics.bySkill.map((s) => ({
          promptId: s.promptId,
          name: skillNameById.get(s.promptId) ?? s.promptId,
          requirement: s.requirement,
          runCount: s.runCount,
          lastUsedAt: s.lastUsedAt.toISOString().slice(0, 10),
        })),
        byMember: metrics.byMember.map((m) => ({
          userId: m.userId,
          name: m.userId ? (userNameById.get(m.userId) ?? m.userId) : "No user",
          runCount: m.runCount,
          lastActiveAt: m.lastActiveAt.toISOString().slice(0, 10),
        })),
      },
    };
    return result;
  });

  if (!data) {
    notFound();
  }

  return <ProjectDetail data={data} />;
}
