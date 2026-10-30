import { z } from "zod";
import {
  getEvalProviderConfig,
  removeEvalProvider,
  setEvalDefaultJudge,
  setEvalProvider,
} from "@/bcs/prompt-registry";
import { withTenantContext } from "@/shared/db";
import { withApiRoute, type Db } from "@/shared/api/handler";
import type { ResolvedCaller } from "@/shared/api/auth";

type Ctx = { caller: ResolvedCaller; db: Db };

const putSchema = z.object({
  provider: z.string(),
  apiKey: z.string().optional(),
  models: z.array(z.string()),
});
const patchSchema = z.object({ defaultJudge: z.string().nullable() });
const deleteSchema = z.object({ provider: z.string() });

/** The org's provider pool config. Keys are never returned, only whether one is set. */
export async function handleGet(_request: Request, { caller, db }: Ctx) {
  const config = await withTenantContext(db, caller.organizationId, (tx) =>
    getEvalProviderConfig(tx, caller.organizationId),
  );
  return Response.json(config);
}

/** Admin: add or update a provider (key and allowed models). */
export async function handlePut(request: Request, { caller, db }: Ctx) {
  const body = putSchema.parse(await request.json());
  await withTenantContext(db, caller.organizationId, (tx) =>
    setEvalProvider(tx, caller.actingUser, body, caller.auditContext),
  );
  return Response.json({ ok: true });
}

/** Admin: set the default judge model. */
export async function handlePatch(request: Request, { caller, db }: Ctx) {
  const { defaultJudge } = patchSchema.parse(await request.json());
  await withTenantContext(db, caller.organizationId, (tx) =>
    setEvalDefaultJudge(tx, caller.actingUser, defaultJudge, caller.auditContext),
  );
  return Response.json({ defaultJudge });
}

export async function handleDelete(request: Request, { caller, db }: Ctx) {
  const { provider } = deleteSchema.parse(await request.json());
  await withTenantContext(db, caller.organizationId, (tx) =>
    removeEvalProvider(tx, caller.actingUser, provider, caller.auditContext),
  );
  return Response.json({ ok: true });
}

export const GET = withApiRoute(handleGet);
export const PUT = withApiRoute(handlePut);
export const PATCH = withApiRoute(handlePatch);
export const DELETE = withApiRoute(handleDelete);
