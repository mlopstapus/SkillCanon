import { z } from "zod";
import { getPromptUsageSummaryForOrganization } from "@/bcs/distribution";
import { assertCoreFeaturesEnabled } from "@/bcs/identity-access";
import { withTenantContext } from "@/shared/db";
import { withApiRoute, type Db } from "@/shared/api/handler";
import type { ResolvedCaller } from "@/shared/api/auth";

const MS_PER_DAY = 24 * 60 * 60 * 1000;

const metricsQuerySchema = z
  .object({
    from: z.string().date().optional(),
    to: z.string().date().optional(),
  })
  .refine((value) => !value.from || !value.to || value.from <= value.to, {
    message: "from must be before or equal to to",
    path: ["from"],
  });

function parseWindow(url: URL): { from: Date; to: Date } {
  const parsed = metricsQuerySchema.parse({
    from: url.searchParams.get("from") ?? undefined,
    to: url.searchParams.get("to") ?? undefined,
  });
  const to = parsed.to ? new Date(`${parsed.to}T23:59:59.999Z`) : new Date();
  const from = parsed.from ? new Date(`${parsed.from}T00:00:00.000Z`) : new Date(to.getTime() - 30 * MS_PER_DAY);
  return { from, to };
}

export async function handleGet(
  request: Request,
  { caller, db }: { caller: ResolvedCaller; params: Record<string, never>; db: Db },
) {
  assertCoreFeaturesEnabled();
  const window = parseWindow(new URL(request.url));
  const result = await withTenantContext(db, caller.organizationId, (tx) =>
    getPromptUsageSummaryForOrganization(tx, caller.organizationId, { window }),
  );
  return Response.json(result);
}

export const GET = withApiRoute(handleGet);
