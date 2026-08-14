import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import {
  countForksOfSkill,
  expand,
  getPrompt,
  listPrompts,
  listProjectSkillAssignmentsForOrganization,
  listProjectsByOrganization,
  listSkillChainRuns,
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

    const [versions, users, teams, projects, assignments, subscriptions, accessibleSkills, copyCount] =
      await Promise.all([
        listVersions(tx, actor, name),
        listUsers(tx, user),
        listTeams(tx, user.orgId),
        listProjectsByOrganization(tx, user.orgId),
        listProjectSkillAssignmentsForOrganization(tx, user.orgId),
        listSubscriptionsForSkill(tx, user.orgId, prompt.id),
        listPrompts(tx, actor),
        countForksOfSkill(tx, user.orgId, prompt.id),
      ]);

    const userNameById = new Map(users.map((u) => [u.id, u.displayName]));
    const teamNameById = new Map(teams.map((t) => [t.id, t.name]));
    const ownerLabel =
      (prompt.ownerType === "user" ? userNameById.get(prompt.ownerId) : teamNameById.get(prompt.ownerId)) ??
      prompt.ownerId;

    const activeVersion = versions.find((v) => v.id === prompt.activeVersionId) ?? null;
    const sortedVersions = [...versions].sort((a, b) => b.version.localeCompare(a.version, undefined, { numeric: true }));
    const kind = activeVersion?.kind ?? "template";
    const hasActiveVersion = activeVersion !== null;
    // A version with zero files is "legacy-shape" — published before
    // 032-skill-file-format-refactor shipped (FR-010/FR-019); it has no
    // Files tab, and its Overview shows the old system/user content inline.
    const isLegacyShape = kind === "template" && hasActiveVersion && (activeVersion?.files.length ?? 0) === 0;

    let preview: PromptDetailData["preview"] = null;
    let previewError: string | null = null;
    let resolvedAppliedPolicies: PromptDetailData["appliedPolicies"] = [];
    // A chain version has no template to render — nothing to preview or
    // resolve policies against (FR-001).
    if (kind === "template" && hasActiveVersion) {
      try {
        const expansion = await expand(tx, {
          organizationId: user.orgId,
          promptName: name,
          userId: user.id,
        });
        preview = expansion.content;
        const effectivePolicies = await resolveAllPolicies(tx, actor, user.id);
        resolvedAppliedPolicies = effectivePolicies
          .filter((p) => expansion.appliedPolicies.includes(p.name))
          .map((p) => ({ label: p.name, type: p.enforcementType }));
      } catch (err) {
        previewError = err instanceof Error ? err.message : "This prompt's preview could not be rendered.";
      }
    }

    const steps: PromptDetailData["steps"] =
      kind === "chain"
        ? (activeVersion?.steps ?? []).map((step) => ({
            id: step.id,
            promptName: step.promptName,
            promptVersionLabel: step.promptVersion ?? null,
            dependsOn: step.dependsOn,
          }))
        : null;

    const chainRuns: PromptDetailData["chainRuns"] =
      kind === "chain"
        ? await (async () => {
            const page = await listSkillChainRuns(tx, user.orgId, prompt.id, { page: 1 });
            return {
              items: page.items.map((run) => ({
                id: run.id,
                version: run.version,
                status: run.status,
                startedAt: run.startedAt.toISOString().slice(0, 16).replace("T", " "),
              })),
              page: page.page,
              pageSize: page.pageSize,
              total: page.total,
            };
          })()
        : null;

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
      sourceUrl: prompt.sourceUrl,
      projectLabels,
      activeVersion: activeVersion?.version ?? null,
      versions: sortedVersions.map((v) => ({
        id: v.id,
        version: v.version,
        createdAt: v.createdAt.toISOString().slice(0, 10),
        tags: (v.tags as string[] | undefined) ?? [],
        isActive: v.id === prompt.activeVersionId,
        kind: v.kind,
        stepCount: v.steps?.length ?? 0,
        contentPreview:
          v.kind === "chain"
            ? null
            : (v.files.find((f) => f.isMain)?.content ?? v.systemTemplate ?? v.userTemplate ?? null),
      })),
      kind,
      hasActiveVersion,
      isLegacyShape,
      files: isLegacyShape ? [] : (activeVersion?.files ?? []),
      legacySystemTemplate: isLegacyShape ? (activeVersion?.systemTemplate ?? null) : null,
      legacyUserTemplate: isLegacyShape ? (activeVersion?.userTemplate ?? null) : null,
      preview,
      previewError,
      appliedPolicies: resolvedAppliedPolicies,
      steps,
      chainRuns,
      accessibleSkillNames: accessibleSkills.map((s) => s.name),
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
      shareSummary: {
        teamCount: grantedTeamIds.size,
        subscriberCount: subscriptions.length,
        copyCount,
      },
    };
    return result;
  });

  if (!data) {
    notFound();
  }

  return <PromptDetail data={data} />;
}
