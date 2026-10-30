import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import { record } from "@/bcs/audit-compliance";
import { checkConclusion, describeCheck, evaluateRequiredSkills, type PrCheckStatus, type RequiredSkillResult } from "../domain/pr-check";
import {
  createCheckRun,
  listPullRequestCommitShas,
  updateCheckRun,
  type GithubAppConfig,
} from "../infrastructure/github-app";
import {
  findPrCheck,
  listPrChecksForLink,
  upsertPrCheck,
  type LiveLinkForRepo,
  type PrCheckRow,
} from "../infrastructure/installations-repo";
import { getInstallationAccessToken } from "./installations";

type Db = PostgresJsDatabase<Record<string, never>>;

/** What evaluation needs from other contexts and the composition root; the webhook has no session, so tenant context is supplied here. */
export interface PullRequestDeps {
  config: GithubAppConfig;
  inTenant<T>(organizationId: string, fn: (tx: Db) => Promise<T>): Promise<T>;
  requiredSkills(tx: Db, organizationId: string, projectId: string): Promise<string[]>;
  usageByCommits(tx: Db, organizationId: string, remote: string, shas: string[]): Promise<Array<{ skillName: string; gitCommitSha: string }>>;
  projectName(tx: Db, organizationId: string, projectId: string): Promise<string | null>;
  fetchImpl?: typeof fetch;
}

export interface PullRequestRef {
  repoFullName: string;
  prNumber: number;
  headSha: string;
}

async function checkName(deps: PullRequestDeps, link: LiveLinkForRepo, tx: Db, linkCount: number): Promise<string> {
  if (linkCount <= 1) return "SkillCanon required skills";
  const name = await deps.projectName(tx, link.organizationId, link.projectId);
  return `SkillCanon required skills (${name ?? link.projectId})`;
}

async function persist(
  deps: PullRequestDeps,
  tx: Db,
  link: LiveLinkForRepo,
  pr: PullRequestRef,
  outcome: { status: PrCheckStatus; results: RequiredSkillResult[]; error?: string },
  linkCount: number,
  token: string | null,
): Promise<PrCheckRow> {
  const existing = await findPrCheck(tx, link.id, pr.prNumber, pr.headSha);
  let githubCheckRunId = existing?.githubCheckRunId ?? null;
  if (token) {
    const text = describeCheck(outcome.status, outcome.results, outcome.error);
    const input = { name: await checkName(deps, link, tx, linkCount), headSha: pr.headSha, conclusion: checkConclusion(outcome.status), ...text };
    if (githubCheckRunId) await updateCheckRun(token, pr.repoFullName, githubCheckRunId, input, deps.fetchImpl);
    else githubCheckRunId = await createCheckRun(token, pr.repoFullName, input, deps.fetchImpl);
  }
  const row = await upsertPrCheck(tx, {
    organizationId: link.organizationId,
    repoLinkId: link.id,
    prNumber: pr.prNumber,
    headSha: pr.headSha,
    results: outcome.results,
    status: outcome.status,
    githubCheckRunId,
    error: outcome.error ?? null,
  });
  await record(tx, {
    organizationId: link.organizationId,
    actorUserId: null,
    actorApiKeyId: null,
    action: "pr_check.created",
    resourceType: "pr_check",
    resourceId: row.id,
    after: {
      repoFullName: pr.repoFullName,
      prNumber: pr.prNumber,
      headSha: pr.headSha,
      status: outcome.status,
      satisfiedSkills: outcome.results.filter((r) => r.satisfied).map((r) => r.skillName),
      missingSkills: outcome.results.filter((r) => !r.satisfied).map((r) => r.skillName),
    },
    transport: "system",
  });
  return row;
}

/**
 * Evaluates one repo link's required skills against a PR and posts or updates
 * the check run for that head commit. If evaluation itself fails (GitHub,
 * lookups), a `neutral` row and check run with a visible error are written
 * instead, so a failure is never silent. Re-evaluating the same head updates
 * the same row and check run (GitHub ties a check run to a commit, so a new
 * head gets a new one).
 */
export async function evaluatePullRequestForLink(
  deps: PullRequestDeps,
  link: LiveLinkForRepo,
  pr: PullRequestRef,
  linkCount: number,
): Promise<PrCheckStatus> {
  try {
    return await deps.inTenant(link.organizationId, async (tx) => {
      const required = await deps.requiredSkills(tx, link.organizationId, link.projectId);
      const token = await getInstallationAccessToken(tx, deps.config, link.organizationId, link.installationId, deps.fetchImpl);
      const shas = await listPullRequestCommitShas(token, pr.repoFullName, pr.prNumber, deps.fetchImpl);
      const usage = await deps.usageByCommits(tx, link.organizationId, `https://github.com/${pr.repoFullName}`, shas);
      const outcome = evaluateRequiredSkills(required, usage);
      await persist(deps, tx, link, pr, outcome, linkCount, token);
      return outcome.status;
    });
  } catch (err) {
    const message = `${err instanceof Error ? err.message : "unexpected error"}`.slice(0, 300);
    await deps.inTenant(link.organizationId, async (tx) => {
      let token: string | null = null;
      try {
        token = await getInstallationAccessToken(tx, deps.config, link.organizationId, link.installationId, deps.fetchImpl);
      } catch {
        // cannot reach GitHub: the neutral row below is still the record
      }
      try {
        await persist(deps, tx, link, pr, { status: "neutral", results: [], error: message }, linkCount, token);
      } catch {
        await persist(deps, tx, link, pr, { status: "neutral", results: [], error: message }, linkCount, null);
      }
    });
    return "neutral";
  }
}

/** Latest evaluation (newest first) and history for one PR on one repo link. */
export async function getPrCheck(db: Db, organizationId: string, repoLinkId: string, prNumber: number) {
  const history = await listPrChecksForLink(db, organizationId, repoLinkId, prNumber);
  return { latest: history[0] ?? null, history };
}
