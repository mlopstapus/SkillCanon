import { queryUsageByRepoAndCommits } from "@/bcs/distribution";
import { getProject, getPromptById, listRequiredSkillsForProject } from "@/bcs/prompt-registry";
import type { PullRequestDeps } from "@/bcs/vcs-integration";
import { withTenantContext } from "@/shared/db";

type AppDb = Parameters<typeof withTenantContext>[0];

/**
 * Wires the VCS context's pull-request evaluation to Prompt Registry and
 * Distribution reads (read contracts only) and supplies tenant context, which
 * a webhook has no session to derive.
 */
export function buildPullRequestDeps(appDb: AppDb): Omit<PullRequestDeps, "config"> {
  return {
    // The repo's tenant tx type is the loose `Record<string, unknown>` schema; BCs take the strict one.
    inTenant: (organizationId, fn) => withTenantContext(appDb, organizationId, (tx) => fn(tx as unknown as Parameters<typeof fn>[0])),
    requiredSkills: (tx, organizationId, projectId) => listRequiredSkillsForProject(tx, organizationId, projectId),
    usageByCommits: async (tx, organizationId, remote, shas) => {
      const rows = await queryUsageByRepoAndCommits(tx, organizationId, remote, shas);
      const names = new Map<string, string | null>();
      for (const promptId of new Set(rows.map((r) => r.promptId))) {
        names.set(promptId, (await getPromptById(tx, organizationId, promptId))?.name ?? null);
      }
      return rows.flatMap((r) => {
        const skillName = names.get(r.promptId);
        return skillName ? [{ skillName, gitCommitSha: r.gitCommitSha }] : [];
      });
    },
    projectName: async (tx, organizationId, projectId) => (await getProject(tx, organizationId, projectId))?.name ?? null,
  };
}
