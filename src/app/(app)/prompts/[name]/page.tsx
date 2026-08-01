import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import {
  expand,
  getPrompt,
  listProjectSkillAssignmentsForOrganization,
  listProjectsByOrganization,
  listSubscriptionsForSkill,
  listVersions,
} from "@/bcs/prompt-registry";
import { resolveAllPolicies } from "@/bcs/governance";
import { authenticateSession, listTeams, listUsers } from "@/bcs/identity-access";
import { authDb, db, withTenantContext } from "@/shared/db";
import { PromptDetail } from "./prompt-detail";
import type { PromptDetailData } from "./prompt-detail-view";

export default async function PromptDetailPage({ params }: { params: Promise<{ name: string }> }) {
  const { name } = await params;
  const cookieHeader = (await headers()).get("cookie");
  const user = await authenticateSession(authDb, cookieHeader);

  if (!user) {
    redirect("/login");
  }

  const data = await withTenantContext(db, user.orgId, async (tx) => {
    const actor = { organizationId: user.orgId, userId: user.id };
    const prompt = await getPrompt(tx, actor, name);
    if (!prompt) {
      return null;
    }

    const [versions, users, teams, projects, assignments, subscriptions] = await Promise.all([
      listVersions(tx, actor, name),
      listUsers(tx, user),
      listTeams(tx, user.orgId),
      listProjectsByOrganization(tx, user.orgId),
      listProjectSkillAssignmentsForOrganization(tx, user.orgId),
      listSubscriptionsForSkill(tx, user.orgId, prompt.id),
    ]);

    const userNameById = new Map(users.map((u) => [u.id, u.displayName]));
    const teamNameById = new Map(teams.map((t) => [t.id, t.name]));
    const ownerLabel =
      (prompt.ownerType === "user" ? userNameById.get(prompt.ownerId) : teamNameById.get(prompt.ownerId)) ??
      prompt.ownerId;

    const activeVersion = versions.find((v) => v.id === prompt.activeVersionId) ?? null;
    const sortedVersions = [...versions].sort((a, b) => b.version.localeCompare(a.version, undefined, { numeric: true }));

    const inputSchemaRows = Array.isArray(activeVersion?.inputSchema)
      ? (activeVersion.inputSchema as Array<{ name: string; type: string; required?: boolean }>).map((f) => ({
          name: f.name,
          type: f.type,
          required: !!f.required,
        }))
      : [];

    const sampleInput = Object.fromEntries(inputSchemaRows.map((f) => [f.name, `(sample ${f.name})`]));

    let preview: PromptDetailData["preview"] = null;
    let previewError: string | null = null;
    let resolvedAppliedPolicies: PromptDetailData["appliedPolicies"] = [];
    try {
      const expansion = await expand(tx, {
        organizationId: user.orgId,
        promptName: name,
        input: sampleInput,
        userId: user.id,
      });
      preview = { systemMessage: expansion.systemMessage, userMessage: expansion.userMessage };
      const effectivePolicies = await resolveAllPolicies(tx, actor, user.id);
      resolvedAppliedPolicies = effectivePolicies
        .filter((p) => expansion.appliedPolicies.includes(p.name))
        .map((p) => ({ label: p.name, type: p.enforcementType }));
    } catch (err) {
      previewError = err instanceof Error ? err.message : "This prompt's preview could not be rendered.";
    }

    const projectAssociations = assignments.filter((a) => a.skillId === prompt.id);
    const projectNameById = new Map(projects.map((p) => [p.id, p.name]));
    const projectLabels = projectAssociations
      .map((a) => projectNameById.get(a.projectId))
      .filter((n): n is string => !!n);

    const grantedUserIds = new Set(
      subscriptions.filter((s) => s.subscriberType === "user").map((s) => s.subscriberId),
    );
    const grantedTeamIds = new Map(
      subscriptions.filter((s) => s.subscriberType === "team").map((s) => [s.subscriberId, s.id]),
    );
    const grantedProjectIds = new Map(
      subscriptions.filter((s) => s.subscriberType === "project").map((s) => [s.subscriberId, s.id]),
    );
    const subscriptionIdByUser = new Map(
      subscriptions.filter((s) => s.subscriberType === "user").map((s) => [s.subscriberId, s.id]),
    );

    const result: PromptDetailData = {
      id: prompt.id,
      name: prompt.name,
      description: prompt.description ?? "",
      isDeprecated: prompt.isDeprecated,
      ownerLabel,
      projectLabels,
      activeVersion: activeVersion?.version ?? null,
      versions: sortedVersions.map((v) => ({
        id: v.id,
        version: v.version,
        createdAt: v.createdAt.toISOString().slice(0, 10),
        tags: (v.tags as string[] | undefined) ?? [],
        isActive: v.id === prompt.activeVersionId,
        systemTemplate: v.systemTemplate,
      })),
      systemTemplate: activeVersion?.systemTemplate ?? null,
      userTemplate: activeVersion?.userTemplate ?? null,
      inputSchemaRows,
      preview,
      previewError,
      appliedPolicies: resolvedAppliedPolicies,
      shareState: {
        users: users
          .filter((u) => !(prompt.ownerType === "user" && u.id === prompt.ownerId))
          .map((u) => ({
            id: u.id,
            name: u.displayName,
            granted: grantedUserIds.has(u.id),
            subscriptionId: subscriptionIdByUser.get(u.id) ?? null,
          })),
        teams: teams.map((t) => ({
          id: t.id,
          name: t.name,
          granted: grantedTeamIds.has(t.id),
          subscriptionId: grantedTeamIds.get(t.id) ?? null,
        })),
        projects: projects.map((p) => ({
          id: p.id,
          name: p.name,
          granted: grantedProjectIds.has(p.id),
          subscriptionId: grantedProjectIds.get(p.id) ?? null,
        })),
      },
      projectAssignment: projects.map((p) => {
        const assignment = projectAssociations.find((a) => a.projectId === p.id);
        return { projectId: p.id, projectName: p.name, requirement: assignment?.requirement ?? null };
      }),
    };
    return result;
  });

  if (!data) {
    notFound();
  }

  return <PromptDetail data={data} />;
}
