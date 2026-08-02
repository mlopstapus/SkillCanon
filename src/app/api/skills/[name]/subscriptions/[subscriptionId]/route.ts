import { unsubscribeSkill } from "@/bcs/prompt-registry";
import { withTenantContext } from "@/shared/db";
import { withApiRoute, type Db } from "@/shared/api/handler";
import type { ResolvedCaller } from "@/shared/api/auth";

interface Params {
  name: string;
  subscriptionId: string;
}

/**
 * `unsubscribeSkill` keys purely off `subscriptionId` (no `promptName`
 * parameter exists on it at all) — `params.name` is only used for the
 * route's own path shape, matching the codebase's established convention
 * of never inventing an implicit cross-check a BC function doesn't itself
 * perform (research.md's chain-run route-splitting rationale applies here
 * too). `unsubscribeSkill` throws the registered `SubscriptionNotFoundError`
 * for a nonexistent/cross-org/not-authorized-for subscription id, and
 * `SubscriberNotAuthorizedError` for an authorization denial — both flow
 * through the shared mapper untouched.
 */
export async function handleDelete(
  request: Request,
  { caller, params, db }: { caller: ResolvedCaller; params: Params; db: Db },
) {
  await withTenantContext(db, caller.organizationId, (tx) =>
    unsubscribeSkill(tx, caller.actingUser, params.subscriptionId, caller.auditContext),
  );
  return new Response(null, { status: 204 });
}

export const DELETE = withApiRoute<Params>(handleDelete);
