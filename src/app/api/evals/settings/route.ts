import { z } from "zod";
import { getEvalsEnabled, setEvalsEnabled } from "@/bcs/prompt-registry";
import { withTenantContext } from "@/shared/db";
import { withApiRoute, type Db } from "@/shared/api/handler";
import type { ResolvedCaller } from "@/shared/api/auth";

const bodySchema = z.object({ enabled: z.boolean() });

/** Whether this org has opted in to central evals (PDR-020). */
export async function handleGet(_request: Request, { caller, db }: { caller: ResolvedCaller; db: Db }) {
  const enabled = await withTenantContext(db, caller.organizationId, (tx) =>
    getEvalsEnabled(tx, caller.organizationId),
  );
  return Response.json({ enabled });
}

/** Org-admin opt-in/out. Opting in also consents to sending skill content to the configured providers. */
export async function handlePut(request: Request, { caller, db }: { caller: ResolvedCaller; db: Db }) {
  const { enabled } = bodySchema.parse(await request.json());
  const result = await withTenantContext(db, caller.organizationId, (tx) =>
    setEvalsEnabled(tx, caller.actingUser, enabled, caller.auditContext),
  );
  return Response.json(result);
}

export const GET = withApiRoute(handleGet);
export const PUT = withApiRoute(handlePut);
