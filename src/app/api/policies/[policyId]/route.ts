import { z } from "zod";
import { POLICY_ENFORCEMENT_TYPES, deletePolicy, getPolicy, updatePolicy } from "@/bcs/governance";
import { withTenantContext } from "@/shared/db";
import { withApiRoute, type Db } from "@/shared/api/handler";
import { notFoundResponse } from "@/shared/api/errors";
import type { ResolvedCaller } from "@/shared/api/auth";

interface Params {
  policyId: string;
}

const updatePolicySchema = z.object({
  name: z.string().min(1).optional(),
  description: z.string().nullable().optional(),
  enforcementType: z.enum(POLICY_ENFORCEMENT_TYPES).optional(),
  content: z.string().min(1).optional(),
  priority: z.number().int().optional(),
});

/** `getPolicy` returns `null` for "not found" (not a thrown error) — data-model.md. */
export async function handleGet(
  request: Request,
  { caller, params, db }: { caller: ResolvedCaller; params: Params; db: Db },
) {
  const policy = await withTenantContext(db, caller.organizationId, (tx) =>
    getPolicy(tx, { organizationId: caller.organizationId, userId: caller.actingUser.id }, params.policyId),
  );
  if (!policy) {
    const mapped = notFoundResponse("POLICY_NOT_FOUND", "Policy not found");
    return Response.json(mapped.body, { status: mapped.status });
  }
  return Response.json(policy);
}

/**
 * `updatePolicy` throws the registered `PolicyNotFoundError` for a
 * missing/cross-org policy — flows through the shared mapper untouched, no
 * special-casing needed here. `UpdatePolicyFields` has no `teamId`, so no
 * scope verifier is needed (a policy's team cannot be changed via update).
 */
export async function handlePut(
  request: Request,
  { caller, params, db }: { caller: ResolvedCaller; params: Params; db: Db },
) {
  const body = updatePolicySchema.parse(await request.json());
  const result = await withTenantContext(db, caller.organizationId, (tx) =>
    updatePolicy(
      tx,
      { organizationId: caller.organizationId, userId: caller.actingUser.id },
      params.policyId,
      body,
      caller.auditContext,
    ),
  );
  return Response.json(result);
}

/** `deletePolicy` (a soft-delete/deactivate) throws the registered `PolicyNotFoundError` for a missing/cross-org policy. */
export async function handleDelete(
  request: Request,
  { caller, params, db }: { caller: ResolvedCaller; params: Params; db: Db },
) {
  await withTenantContext(db, caller.organizationId, (tx) =>
    deletePolicy(
      tx,
      { organizationId: caller.organizationId, userId: caller.actingUser.id },
      params.policyId,
      caller.auditContext,
    ),
  );
  return new Response(null, { status: 204 });
}

export const GET = withApiRoute<Params>(handleGet);
export const PUT = withApiRoute<Params>(handlePut);
export const DELETE = withApiRoute<Params>(handleDelete);
