import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import { normalizeGitRemoteUrl, type CommitUsage } from "../domain/prompt-usage";
import { listByRemoteAndCommits } from "../infrastructure/prompt-usage-repo";

/**
 * Successful skill serves for one organization whose recorded git remote
 * matches `gitRemoteUrl` (compared in normalized form, so SSH and HTTPS
 * clones of one repo match) and whose commit is one of `commitShas`. The
 * exact, non-probabilistic correlation PDR-013 chose; scoped by
 * `organizationId` on top of RLS. An unrecognizable remote or an empty commit
 * list matches nothing.
 */
export async function queryUsageByRepoAndCommits<TSchema extends Record<string, unknown>>(
  db: PostgresJsDatabase<TSchema>,
  organizationId: string,
  gitRemoteUrl: string,
  commitShas: string[],
): Promise<CommitUsage[]> {
  const remote = normalizeGitRemoteUrl(gitRemoteUrl);
  const shas = [...new Set(commitShas.map((s) => s.toLowerCase()))];
  if (!remote || shas.length === 0) return [];
  return listByRemoteAndCommits(db, organizationId, remote, shas);
}
