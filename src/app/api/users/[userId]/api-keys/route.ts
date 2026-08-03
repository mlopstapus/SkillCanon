import { z } from "zod";
import { NotAuthorizedError, createApiKey, listApiKeys } from "@/bcs/identity-access";
import { withTenantContext } from "@/shared/db";
import { withApiRoute, type Db } from "@/shared/api/handler";
import type { ResolvedCaller } from "@/shared/api/auth";

interface Params {
  userId: string;
}

const createApiKeySchema = z.object({
  name: z.string().min(1),
  scopes: z.array(z.string()).min(1),
  expiresAt: z.string().datetime().optional(),
});

/**
 * `createApiKey(db, actingUser, params, auditContext?)` has no target-user
 * parameter at all — it always creates a key owned by `actingUser`
 * (confirmed by reading create-api-key.ts; CONTRACT.md's own row says
 * "Creates a scoped bearer key for `actingUser`"). Unlike the legacy
 * Python service (which took an explicit `user_id` and let an admin issue
 * a key on another user's behalf), this BC function structurally cannot
 * create a key owned by anyone but the caller — so this route only
 * supports self-creation. An admin hitting another user's `[userId]` path
 * is a 403, not a delegated create on that user's behalf.
 */
export async function handlePost(
  request: Request,
  { caller, params, db }: { caller: ResolvedCaller; params: Params; db: Db },
) {
  if (params.userId !== caller.actingUser.id) {
    throw new NotAuthorizedError();
  }
  const body = createApiKeySchema.parse(await request.json());
  const result = await withTenantContext(db, caller.organizationId, (tx) =>
    createApiKey(
      tx,
      caller.actingUser,
      {
        name: body.name,
        scopes: body.scopes,
        expiresAt: body.expiresAt ? new Date(body.expiresAt) : undefined,
      },
      caller.auditContext,
    ),
  );
  return Response.json(result, { status: 201 });
}

/** `listApiKeys` enforces self-or-admin authorization internally against `params.userId`. */
export async function handleGet(
  request: Request,
  { caller, params, db }: { caller: ResolvedCaller; params: Params; db: Db },
) {
  const keys = await withTenantContext(db, caller.organizationId, (tx) =>
    listApiKeys(tx, caller.actingUser, params.userId),
  );
  return Response.json(keys);
}

export const POST = withApiRoute<Params>(handlePost);
export const GET = withApiRoute<Params>(handleGet);
