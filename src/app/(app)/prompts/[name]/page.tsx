import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import {
  EVAL_CASES_FILE_NAME,
  countForksOfSkill,
  getEvalProviderPool,
  getEvalRun,
  getEvalsEnabled,
  listEvalRuns,
  parseEvalCases,
  expand,
  getPrompt,
  listPrompts,
  listProjectSkillAssignmentsForOrganization,
  listProjectsByOrganization,
  listSkillChainRuns,
  listSubscriptionsForSkill,
  listVersions,
} from "@/bcs/prompt-registry";
import {
  lineDiff,
  listFeedbackForSkill,
  listImprovementDrafts,
  resolveDrafter,
} from "@/bcs/distribution";
import { resolveAllPolicies } from "@/bcs/governance";
import { authenticateSession, listTeams, listUsers } from "@/bcs/identity-access";
import { authDb, db, withTenantContext } from "@/shared/db";
import { PromptDetail } from "./prompt-detail";
import { buildEvalMatrix, type EvalRunView, type EvalVersionInput } from "./eval-matrix";
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

    const [versions, users, teams, projects, assignments, subscriptions, accessibleSkills, copyCount, feedbackSummary] =
      await Promise.all([
        listVersions(tx, actor, name),
        listUsers(tx, user),
        listTeams(tx, user.orgId),
        listProjectsByOrganization(tx, user.orgId),
        listProjectSkillAssignmentsForOrganization(tx, user.orgId),
        listSubscriptionsForSkill(tx, user.orgId, prompt.id),
        listPrompts(tx, actor),
        countForksOfSkill(tx, user.orgId, prompt.id),
        listFeedbackForSkill(tx, user.orgId, prompt.id),
      ]);
    const [drafts, draftingOptedIn] = await Promise.all([
      listImprovementDrafts(tx, user.orgId, prompt.id),
      getEvalsEnabled(tx, user.orgId),
    ]);

    const userNameById = new Map(users.map((u) => [u.id, u.displayName]));
    const teamNameById = new Map(teams.map((t) => [t.id, t.name]));
    const ownerLabel =
      (prompt.ownerType === "user" ? userNameById.get(prompt.ownerId) : teamNameById.get(prompt.ownerId)) ??
      prompt.ownerId;
    const isOwnSkill = prompt.ownerType === "user" && prompt.ownerId === user.id;
    const team = prompt.ownerType === "team" ? teams.find((candidate) => candidate.id === prompt.ownerId) : undefined;
    const canTransferOwnership =
      user.role === "admin" ||
      (prompt.ownerType === "user" && prompt.ownerId === user.id) ||
      (prompt.ownerType === "team" && team?.ownerId === user.id);

    const activeVersion = versions.find((v) => v.id === prompt.activeVersionId) ?? null;
    const sortedVersions = [...versions].sort((a, b) => b.version.localeCompare(a.version, undefined, { numeric: true }));
    // Evals tab (017/004): the latest eight versions, with their finished results.
    const poolModels = getEvalProviderPool().models;
    const evalVersions: EvalVersionInput[] = [];
    for (const v of [...sortedVersions].slice(0, 8).reverse()) {
      let cases: EvalVersionInput["cases"] = [];
      const casesFile = v.files.find((f) => f.name === EVAL_CASES_FILE_NAME);
      if (casesFile) {
        try {
          cases = parseEvalCases(casesFile.content).map((c) => ({ id: c.id, input: c.input }));
        } catch {
          cases = [];
        }
      }
      const listed = (await listEvalRuns(tx, actor, name, v.version)).sort(
        (a, b) => b.createdAt.getTime() - a.createdAt.getTime(),
      );
      const runs: EvalRunView[] = [];
      let detailed = 0;
      for (const run of listed) {
        const withResults = run.status === "succeeded" && detailed < 3 ? await getEvalRun(tx, actor, name, v.version, run.id) : null;
        if (withResults) detailed += 1;
        runs.push({
          id: run.id,
          status: run.status,
          contentDigest: run.contentDigest,
          models: run.models,
          error: run.error,
          results: withResults?.results ?? [],
        });
      }
      evalVersions.push({ versionId: v.id, version: v.version, isActive: v.id === prompt.activeVersionId, hasCases: cases.length > 0, cases, runs });
    }

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
      ownerType: prompt.ownerType,
      ownerId: prompt.ownerId,
      ownerLabel,
      isOwnSkill,
      canTransferOwnership,
      transferCandidates: {
        users: users
          .filter((candidate) => !(prompt.ownerType === "user" && candidate.id === prompt.ownerId))
          .map((candidate) => ({ id: candidate.id, name: candidate.displayName })),
        teams: teams
          .filter((candidate) => !(prompt.ownerType === "team" && candidate.id === prompt.ownerId))
          .map((candidate) => ({ id: candidate.id, name: candidate.name })),
      },
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
      evals: { enabled: draftingOptedIn, poolModels, matrix: buildEvalMatrix(evalVersions, poolModels) },
      feedback: {
        versions: feedbackSummary.byVersion.map(({ version, up, down, notes }) => ({ version, up, down, notes })),
        notes: feedbackSummary.notes.map((note) => ({
          id: note.id,
          serveId: note.serveId,
          version: note.version,
          rating: note.rating,
          text: note.text ?? "",
          author: userNameById.get(note.userId) ?? "Unknown user",
          createdAt: note.createdAt.toISOString().slice(0, 16).replace("T", " "),
          addressedInVersion: note.addressedInVersionId
            ? (versions.find((v) => v.id === note.addressedInVersionId)?.version ?? "a later version")
            : null,
        })),
        // Same rule as transferring ownership: the user owner, the owning team's owner, or an org admin.
        canTriage: canTransferOwnership,
        versionOptions: sortedVersions.map((v) => ({ id: v.id, version: v.version })),
        drafts: drafts.map((draft) => {
          const base = versions.find((v) => v.id === draft.baseVersionId);
          const baseContent = base?.files.find((f) => f.isMain)?.content ?? "";
          return {
            id: draft.id,
            version: base?.version ?? "?",
            status: draft.status,
            rationale: draft.rationale,
            model: draft.model,
            noteCount: draft.sourceFeedbackIds.length,
            createdAt: draft.createdAt.toISOString().slice(0, 16).replace("T", " "),
            acceptedVersion: draft.acceptedVersionId
              ? (versions.find((v) => v.id === draft.acceptedVersionId)?.version ?? null)
              : null,
            diff: lineDiff(baseContent, draft.proposedContent),
          };
        }),
        draftableVersions: canTransferOwnership
          ? feedbackSummary.byVersion.flatMap((row) => {
              const v = versions.find((candidate) => candidate.id === row.versionId);
              const openNotes = feedbackSummary.notes.filter(
                (n) => n.versionId === row.versionId && n.addressedAt === null,
              ).length;
              return v && v.kind === "template" && v.files.some((f) => f.isMain) && openNotes > 0
                ? [{ id: v.id, version: v.version, openNotes }]
                : [];
            })
          : [],
        drafting: {
          configured: resolveDrafter() !== null,
          optedIn: draftingOptedIn,
          canChangeOptIn: user.role === "admin",
        },
      },
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
