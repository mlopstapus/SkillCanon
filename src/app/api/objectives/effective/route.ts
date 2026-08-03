import { resolveEffectiveObjectives } from "@/bcs/governance";
import { withTenantContext } from "@/shared/db";
import { withApiRoute, type Db } from "@/shared/api/handler";
import type { ResolvedCaller } from "@/shared/api/auth";

/** `?userId=` defaults to the caller's own id; `?projectId=` is optional (contract). */
export async function handleGet(request: Request, { caller, db }: { caller: ResolvedCaller; db: Db }) {
  const url = new URL(request.url);
  const targetUserId = url.searchParams.get("userId") ?? caller.actingUser.id;
  const projectId = url.searchParams.get("projectId") ?? undefined;

  const result = await withTenantContext(db, caller.organizationId, (tx) =>
    resolveEffectiveObjectives(
      tx,
      { organizationId: caller.organizationId, userId: caller.actingUser.id },
      targetUserId,
      projectId,
    ),
  );
  return Response.json(result);
}

export const GET = withApiRoute(handleGet);
