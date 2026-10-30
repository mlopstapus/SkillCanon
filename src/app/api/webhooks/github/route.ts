import { handleGithubWebhook } from "@/bcs/vcs-integration";
import { authDb } from "@/shared/db";

type Db = typeof authDb;

const STATUS = { "not-configured": 503, "bad-signature": 401, "bad-payload": 400 } as const;

/**
 * Thin GitHub webhook endpoint: no session exists here, so it runs on the
 * webhook role's connection and forwards the raw body (the signature covers
 * those exact bytes) straight into the VCS bounded context.
 */
export async function handlePost(request: Request, { db }: { db: Db }) {
  const outcome = await handleGithubWebhook(db, {
    rawBody: await request.text(),
    signatureHeader: request.headers.get("x-hub-signature-256"),
    deliveryId: request.headers.get("x-github-delivery"),
    eventName: request.headers.get("x-github-event"),
  });
  if (outcome.status === "rejected") {
    return Response.json({ error: outcome.reason }, { status: STATUS[outcome.reason] });
  }
  return Response.json({ status: outcome.status });
}

export const POST = (request: Request) => handlePost(request, { db: authDb });
