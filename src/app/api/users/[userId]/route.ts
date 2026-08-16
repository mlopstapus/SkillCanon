import { z } from "zod";
import { CrossOrgUserAccessError, deactivateUser, getUser, updateUser } from "@/bcs/identity-access";
import { withTenantContext } from "@/shared/db";
import { withApiRoute, type Db } from "@/shared/api/handler";
import { notFoundResponse } from "@/shared/api/errors";
import type { ResolvedCaller } from "@/shared/api/auth";

interface Params {
  userId: string;
}

const updateUserSchema = z.object({
  displayName: z.string().min(1).optional(),
  email: z.string().email().optional(),
  username: z.string().min(1).optional(),
  role: z.enum(["admin", "member"]).optional(),
  teamId: z.string().min(1).nullable().optional(),
});

/**
 * `getUser` throws `CrossOrgUserAccessError` for a nonexistent or
 * cross-organization user. This route keeps the established external
 * `USER_NOT_FOUND` response while allowing operational errors to propagate.
 */
export async function handleGet(
  request: Request,
  { caller, params, db }: { caller: ResolvedCaller; params: Params; db: Db },
) {
  try {
    const user = await withTenantContext(db, caller.organizationId, (tx) =>
      getUser(tx, params.userId, caller.organizationId),
    );
    return Response.json(user);
  } catch (err) {
    if (err instanceof CrossOrgUserAccessError) {
      const mapped = notFoundResponse("USER_NOT_FOUND", "User not found");
      return Response.json(mapped.body, { status: mapped.status });
    }
    throw err;
  }
}

/**
 * `updateUser` correctly throws the registered `CrossOrgUserAccessError`
 * for a missing/cross-org target (and `NotAuthorizedError` for a
 * non-admin/non-self caller) — both flow through the shared mapper
 * untouched, no special-casing needed here.
 */
export async function handlePut(
  request: Request,
  { caller, params, db }: { caller: ResolvedCaller; params: Params; db: Db },
) {
  const body = updateUserSchema.parse(await request.json());
  await withTenantContext(db, caller.organizationId, (tx) =>
    updateUser(tx, caller.actingUser, params.userId, body, { auditContext: caller.auditContext }),
  );
  const user = await withTenantContext(db, caller.organizationId, (tx) =>
    getUser(tx, params.userId, caller.organizationId),
  );
  return Response.json(user);
}

/**
 * `deactivateUser` correctly throws the registered `NotAuthorizedError`
 * (non-admin caller), `CrossOrgUserAccessError` (missing/cross-org target),
 * and `LastActiveAdminError` (org's last active admin) — all flow through
 * the shared mapper untouched.
 */
export async function handleDelete(
  request: Request,
  { caller, params, db }: { caller: ResolvedCaller; params: Params; db: Db },
) {
  await withTenantContext(db, caller.organizationId, (tx) =>
    deactivateUser(tx, caller.actingUser, params.userId, { auditContext: caller.auditContext }),
  );
  return new Response(null, { status: 204 });
}

export const GET = withApiRoute<Params>(handleGet);
export const PUT = withApiRoute<Params>(handlePut);
export const DELETE = withApiRoute<Params>(handleDelete);
