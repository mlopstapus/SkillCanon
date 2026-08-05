import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getPromptUsageSummaryForOrganization } from "@/bcs/distribution";
import { authenticateSession, getOrganization, listTeams, listUsers } from "@/bcs/identity-access";
import { listProjectsByOrganization, listSkillsByOrganization } from "@/bcs/prompt-registry";
import { authDb, db, withTenantContext } from "@/shared/db";
import { DashboardView, type DashboardData } from "./dashboard-view";

function defaultUsageWindow(now = new Date()): { from: Date; to: Date } {
  return { from: new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000), to: now };
}

function formatWindowLabel(from: Date, to: Date): string {
  return `${from.toISOString().slice(0, 10)} to ${to.toISOString().slice(0, 10)}`;
}

export default async function DashboardPage() {
  const cookieHeader = (await headers()).get("cookie");
  const user = await authenticateSession(authDb, cookieHeader);
  if (!user) {
    redirect("/login");
  }

  const window = defaultUsageWindow();

  const data = await withTenantContext(db, user.orgId, async (tx) => {
    const [organization, teams, users, projects, prompts, usage] = await Promise.all([
      getOrganization(tx, user.orgId),
      listTeams(tx, user.orgId),
      listUsers(tx, user),
      listProjectsByOrganization(tx, user.orgId),
      listSkillsByOrganization(tx, user.orgId),
      getPromptUsageSummaryForOrganization(tx, user.orgId, { window }),
    ]);

    const recentPrompts = [...prompts]
      .sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime())
      .slice(0, 5)
      .map((prompt) => ({
        name: prompt.name,
        description: prompt.description,
        updatedAt: prompt.updatedAt.toISOString().slice(0, 10),
      }));

    const result: DashboardData = {
      orgName: organization.name,
      teamCount: teams.length,
      memberCount: users.length,
      projectCount: projects.length,
      promptCount: prompts.length,
      usage: {
        totalInvocations: usage.totalInvocations,
        successCount: usage.successCount,
        failureCount: usage.failureCount,
        windowLabel: formatWindowLabel(window.from, window.to),
      },
      recentPrompts,
    };
    return result;
  });

  return <DashboardView data={data} />;
}
