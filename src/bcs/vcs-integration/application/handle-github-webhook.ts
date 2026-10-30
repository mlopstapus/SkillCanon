import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import { record } from "@/bcs/audit-compliance";
import { getGithubAppConfig, verifyWebhookSignature } from "../infrastructure/github-app";
import {
  claimDelivery,
  findByGithubInstallationId,
  updateInstallation,
} from "../infrastructure/installations-repo";

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
    if (params.eventName !== "installation") return { status: "ignored" } as const; // pull_request: feature 005
    return handleInstallationEvent(tx, payload);
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
