import { resolveEffectivePolicies } from "@/bcs/governance";
import { withTenantContext } from "@/shared/db";
import { withApiRoute, type Db } from "@/shared/api/handler";
import type { ResolvedCaller } from "@/shared/api/auth";

/** `?userId=` is optional and defaults to the caller's own id (contract). */
export async function handleGet(request: Request, { caller, db }: { caller: ResolvedCaller; db: Db }) {
  const url = new URL(request.url);
  const targetUserId = url.searchParams.get("userId") ?? caller.actingUser.id;

  const result = await withTenantContext(db, caller.organizationId, (tx) =>
    resolveEffectivePolicies(
      tx,
      { organizationId: caller.organizationId, userId: caller.actingUser.id },
      targetUserId,
    ),
  );
  return Response.json(result);
}

export const GET = withApiRoute(handleGet);
