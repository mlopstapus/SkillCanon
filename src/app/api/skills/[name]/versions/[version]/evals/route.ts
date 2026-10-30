import { z } from "zod";
import { listEvalRuns, resolveEvalProviderPool, submitEvalRun } from "@/bcs/prompt-registry";
import { withTenantContext } from "@/shared/db";
import { withApiRoute, type Db } from "@/shared/api/handler";
import type { ResolvedCaller } from "@/shared/api/auth";

interface Params {
  name: string;
  version: string;
}

const submitSchema = z.object({
  models: z.array(z.string().min(1)),
  judge: z.string().min(1).optional(),
});

/** Submits a central eval run (PDR-020): stored as a queued job for the worker, 202 with the run. */
export async function handlePost(
  request: Request,
  { caller, params, db }: { caller: ResolvedCaller; params: Params; db: Db },
) {
  const body = submitSchema.parse(await request.json());
  const run = await withTenantContext(db, caller.organizationId, async (tx) =>
    submitEvalRun(
      tx,
      { organizationId: caller.organizationId, userId: caller.actingUser.id },
      { promptName: params.name, version: params.version, ...body },
      await resolveEvalProviderPool(tx, caller.organizationId),
      caller.auditContext,
    ),
  );
  return Response.json(run, { status: 202 });
}

export async function handleGet(
  _request: Request,
  { caller, params, db }: { caller: ResolvedCaller; params: Params; db: Db },
) {
  const runs = await withTenantContext(db, caller.organizationId, (tx) =>
    listEvalRuns(tx, { organizationId: caller.organizationId, userId: caller.actingUser.id }, params.name, params.version),
  );
  return Response.json(runs);
}

export const POST = withApiRoute<Params>(handlePost);
export const GET = withApiRoute<Params>(handleGet);
