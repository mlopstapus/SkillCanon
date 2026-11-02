import { z } from "zod";
import { getEvalGate, setEvalGate } from "@/bcs/prompt-registry";
import { withTenantContext } from "@/shared/db";
import { withApiRoute, type Db } from "@/shared/api/handler";
import type { ResolvedCaller } from "@/shared/api/auth";

type Ctx = { caller: ResolvedCaller; params: { name: string }; db: Db };

const putSchema = z.object({
  enabled: z.boolean(),
  models: z.array(z.string()).default([]),
  minPassPct: z.number().int().default(100),
});

/** The skill's eval gate and its candidate versions (published but not active). */
export async function handleGet(_request: Request, { caller, params, db }: Ctx) {
  const gate = await withTenantContext(db, caller.organizationId, (tx) =>
    getEvalGate(tx, caller.organizationId, params.name),
  );
  return Response.json(gate);
}

/** Admin or skill owner: turn the gate on or off and set its models and threshold. */
export async function handlePut(request: Request, { caller, params, db }: Ctx) {
  const body = putSchema.parse(await request.json());
  const gate = await withTenantContext(db, caller.organizationId, (tx) =>
    setEvalGate(tx, caller.actingUser, params.name, body, caller.auditContext),
  );
  return Response.json(gate);
}

export const GET = withApiRoute(handleGet);
export const PUT = withApiRoute(handlePut);
