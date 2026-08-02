import { revokeApiKey } from "@/bcs/identity-access";
import { withTenantContext } from "@/shared/db";
import { withApiRoute, type Db } from "@/shared/api/handler";
import type { ResolvedCaller } from "@/shared/api/auth";

interface Params {
  keyId: string;
}

/**
 * `revokeApiKey` enforces self-or-admin authorization internally (the
 * key's owner, or an org admin acting on a key in their own organization)
 * and throws the registered `ApiKeyNotFoundError` for a missing/cross-org
 * key — flows through the shared mapper untouched, no special-casing
 * needed here.
 */
export async function handleDelete(
  request: Request,
  { caller, params, db }: { caller: ResolvedCaller; params: Params; db: Db },
) {
  await withTenantContext(db, caller.organizationId, (tx) =>
    revokeApiKey(tx, caller.actingUser, params.keyId, caller.auditContext),
  );
  return new Response(null, { status: 204 });
}

export const DELETE = withApiRoute<Params>(handleDelete);
