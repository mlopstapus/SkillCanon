import { getSkillChainRun } from "@/bcs/prompt-registry";
import { withTenantContext } from "@/shared/db";
import { withApiRoute, type Db } from "@/shared/api/handler";
import { notFoundResponse } from "@/shared/api/errors";
import type { ResolvedCaller } from "@/shared/api/auth";

interface Params {
  runId: string;
}

export async function handleGet(
  request: Request,
  { caller, params, db }: { caller: ResolvedCaller; params: Params; db: Db },
) {
  const result = await withTenantContext(db, caller.organizationId, (tx) =>
    getSkillChainRun(tx, caller.organizationId, params.runId),
  );
  if (!result) {
    const mapped = notFoundResponse("CHAIN_RUN_NOT_FOUND", "Chain run not found");
    return Response.json(mapped.body, { status: mapped.status });
  }
  return Response.json(result);
}

export const GET = withApiRoute<Params>(handleGet);
