import { z } from "zod";
import { POLICY_ENFORCEMENT_TYPES, createPolicy, listTeamPolicies } from "@/bcs/governance";
import type { PolicyScopeVerifier } from "@/bcs/governance";
import { getTeam } from "@/bcs/identity-access";
import { withTenantContext } from "@/shared/db";
import { withApiRoute, type Db } from "@/shared/api/handler";
import type { ResolvedCaller } from "@/shared/api/auth";

const createPolicySchema = z.object({
  teamId: z.string().min(1),
  name: z.string().min(1),
  description: z.string().nullable().optional(),
  enforcementType: z.enum(POLICY_ENFORCEMENT_TYPES),
  content: z.string().min(1),
  priority: z.number().int().optional(),
});

const listPoliciesQuerySchema = z.object({
  teamId: z.string().min(1),
});

/**
 * `createPolicy(db, actor: PolicyActor, params, scopeVerifier, auditContext?)` —
 * the contract doc's `createPolicy(tx, params, auditContext)` shape doesn't
 * match the real source: `actor` is a separate `{organizationId, userId}`
 * object (not folded into `params`), and a `PolicyScopeVerifier` is a
 * required fourth argument used internally to confirm `params.teamId`
 * belongs to the caller's organization. Built here via `getTeam` (throws a
 * bare `Error` for "not found," which this verifier treats as "does not
 * belong").
 */
export async function handlePost(request: Request, { caller, db }: { caller: ResolvedCaller; db: Db }) {
  const body = createPolicySchema.parse(await request.json());
  const result = await withTenantContext(db, caller.organizationId, (tx) => {
    const verifier: PolicyScopeVerifier = {
      teamBelongsToOrganization: async (organizationId, teamId) => {
        try {
          await getTeam(tx, organizationId, teamId);
          return true;
        } catch {
          return false;
        }
      },
    };
    return createPolicy(
      tx,
      { organizationId: caller.organizationId, userId: caller.actingUser.id },
      body,
      verifier,
      caller.auditContext,
    );
  });
  return Response.json(result, { status: 201 });
}

export async function handleGet(request: Request, { caller, db }: { caller: ResolvedCaller; db: Db }) {
  const url = new URL(request.url);
  const { teamId } = listPoliciesQuerySchema.parse({ teamId: url.searchParams.get("teamId") ?? undefined });

  const policies = await withTenantContext(db, caller.organizationId, (tx) =>
    listTeamPolicies(tx, { organizationId: caller.organizationId, userId: caller.actingUser.id }, teamId),
  );
  return Response.json(policies);
}

export const POST = withApiRoute(handlePost);
export const GET = withApiRoute(handleGet);
