import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import { record } from "@/bcs/audit-compliance";
import { getGithubAppConfig, verifyWebhookSignature } from "../infrastructure/github-app";
import {
  claimDelivery,
  findByGithubInstallationId,
  listLiveLinksForGithubRepo,
  updateInstallation,
} from "../infrastructure/installations-repo";
import { evaluatePullRequestForLink, type PullRequestDeps } from "./evaluate-pull-request";

type Db = PostgresJsDatabase<Record<string, never>>;

export type WebhookOutcome =
  | { status: "rejected"; reason: "not-configured" | "bad-signature" | "bad-payload" }
  | { status: "duplicate" }
  | { status: "handled" | "ignored" };

/**
 * Entry point for every GitHub delivery. Takes the raw body (the signature is
 * over those exact bytes), verifies it, dedupes by delivery id and dispatches
 * on event type. The organization is only ever taken from the stored
 * installation, never from the payload or request. `db` must be the webhook
 * role's connection (there is no session or tenant context here).
 *
 * The claim and the handling share one transaction, so a failure rolls the
 * claim back and GitHub's retry is processed rather than skipped.
 */
export async function handleGithubWebhook(
  db: Db,
  params: { rawBody: string; signatureHeader: string | null; deliveryId: string | null; eventName: string | null },
  env?: Record<string, string | undefined>,
  pullRequestDeps?: Omit<PullRequestDeps, "config">,
): Promise<WebhookOutcome> {
  const config = getGithubAppConfig(env);
  if (!config) return { status: "rejected", reason: "not-configured" };
  if (!verifyWebhookSignature(config.webhookSecret, params.rawBody, params.signatureHeader)) {
    return { status: "rejected", reason: "bad-signature" };
  }
  if (!params.deliveryId || !params.eventName) return { status: "rejected", reason: "bad-payload" };

  let payload: Record<string, unknown>;
  try {
    payload = JSON.parse(params.rawBody) as Record<string, unknown>;
  } catch {
    return { status: "rejected", reason: "bad-payload" };
  }

  return db.transaction(async (tx) => {
    if (!(await claimDelivery(tx, params.deliveryId as string))) return { status: "duplicate" } as const;
    if (params.eventName === "installation") return handleInstallationEvent(tx, payload);
    if (params.eventName === "pull_request" && pullRequestDeps) {
      return handlePullRequestEvent(tx, payload, { ...pullRequestDeps, config });
    }
    return { status: "ignored" } as const;
  });
}

async function handleInstallationEvent(
  tx: Parameters<Parameters<Db["transaction"]>[0]>[0],
  payload: Record<string, unknown>,
): Promise<WebhookOutcome> {
  const action = payload.action;
  const githubId = (payload.installation as { id?: unknown } | undefined)?.id;
  if (typeof githubId !== "number") return { status: "ignored" };

  // `created` carries no organization marker, so it cannot be attributed here;
  // the install callback records the row.
  const row = await findByGithubInstallationId(tx, githubId);
  if (!row) return { status: "ignored" };

  const now = new Date();
  let set: { suspendedAt?: Date | null; deletedAt?: Date } | undefined;
  let verb: "updated" | "deleted" | undefined;
  if (action === "suspend") ({ set, verb } = { set: { suspendedAt: now }, verb: "updated" });
  else if (action === "unsuspend") ({ set, verb } = { set: { suspendedAt: null }, verb: "updated" });
  else if (action === "deleted") ({ set, verb } = { set: { deletedAt: now }, verb: "deleted" });
  if (!set || !verb) return { status: "ignored" };

  await updateInstallation(tx, row.id, set);
  await record(tx, {
    organizationId: row.organizationId,
    actorUserId: null,
    actorApiKeyId: null,
    action: `vcs_installation.${verb}`,
    resourceType: "vcs_installation",
    resourceId: row.id,
    before: { suspendedAt: row.suspendedAt, deletedAt: row.deletedAt },
    after: { action, ...set },
    transport: "system",
  });
  return { status: "handled" };
}

const EVALUATED_ACTIONS = ["opened", "synchronize", "reopened"];

/**
 * The organization comes only from the stored repo link the GitHub repo id
 * maps to (and the payload's installation id must be that link's
 * installation), never from anything else in the payload. A repo no project
 * links to is a quiet no-op.
 */
async function handlePullRequestEvent(
  tx: Parameters<Parameters<Db["transaction"]>[0]>[0],
  payload: Record<string, unknown>,
  deps: PullRequestDeps,
): Promise<WebhookOutcome> {
  const repo = payload.repository as { id?: unknown; full_name?: unknown } | undefined;
  const pull = payload.pull_request as { number?: unknown; head?: { sha?: unknown } } | undefined;
  const githubInstallationId = (payload.installation as { id?: unknown } | undefined)?.id;
  if (
    !EVALUATED_ACTIONS.includes(String(payload.action)) ||
    typeof repo?.id !== "number" ||
    typeof repo.full_name !== "string" ||
    typeof pull?.number !== "number" ||
    typeof pull.head?.sha !== "string"
  ) {
    return { status: "ignored" };
  }

  const links = (await listLiveLinksForGithubRepo(tx, repo.id)).filter((l) => l.githubInstallationId === githubInstallationId);
  if (links.length === 0) return { status: "ignored" };
  const pr = { repoFullName: repo.full_name, prNumber: pull.number, headSha: pull.head.sha };
  for (const link of links) await evaluatePullRequestForLink(deps, link, pr, links.length);
  return { status: "handled" };
}
