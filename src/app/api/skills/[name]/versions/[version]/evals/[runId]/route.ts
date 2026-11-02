import { getEvalRun } from "@/bcs/prompt-registry";
import { withTenantContext } from "@/shared/db";
import { withApiRoute, type Db } from "@/shared/api/handler";
import { requireScope, type ResolvedCaller } from "@/shared/api/auth";

interface Params {
  name: string;
  version: string;
  runId: string;
}

/** Status and per-case × model results of one eval run. */
export async function handleGet(
  _request: Request,
  { caller, params, db }: { caller: ResolvedCaller; params: Params; db: Db },
) {
  requireScope(caller, "evals:read", "evals:run");
  const run = await withTenantContext(db, caller.organizationId, (tx) =>
    getEvalRun(
      tx,
      { organizationId: caller.organizationId, userId: caller.actingUser.id },
      params.name,
      params.version,
      params.runId,
    ),
  );
  return Response.json(run);
}

export const GET = withApiRoute<Params>(handleGet);
