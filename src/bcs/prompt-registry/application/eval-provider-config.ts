import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import { DEFAULT_WEB_AUDIT_CONTEXT, record, type AuditContext } from "@/bcs/audit-compliance";
import { NotAuthorizedError, type UserSummary } from "@/bcs/identity-access";
import { withAudit } from "@/shared/db";
import { InvalidEvalRequestError, type EvalProviderPool } from "../domain/eval-run";
import {
  deleteProviderConfig,
  getDefaultJudge,
  listProviderConfigs,
  upsertDefaultJudge,
  upsertProviderConfig,
} from "../infrastructure/eval-runs-repo";
import { getEvalProviderPool } from "../infrastructure/eval-provider-pool";
import { createEvalProvider, EVAL_PROVIDER_IDS, type EvalProviderId } from "../infrastructure/eval-providers";
import { openSecret, sealSecret } from "../infrastructure/secret-box";

type Db = PostgresJsDatabase<Record<string, never>>;

export interface EvalProviderConfigView {
  providers: { provider: EvalProviderId; models: string[]; keySet: true; updatedAt: Date }[];
  defaultJudge: string | null;
}

/** Admin view of the pool config. Never returns key material. */
export async function getEvalProviderConfig(db: Db, organizationId: string): Promise<EvalProviderConfigView> {
  const rows = await listProviderConfigs(db, organizationId);
  return {
    providers: rows.map((r) => ({ provider: r.provider, models: r.models, keySet: true as const, updatedAt: r.updatedAt })),
    defaultJudge: await getDefaultJudge(db, organizationId),
  };
}

function requireAdmin(user: UserSummary) {
  if (user.role !== "admin") throw new NotAuthorizedError();
}

function audit(user: UserSummary, ctx: AuditContext, action: string, resourceId: string, after: unknown) {
  return (tx: Db) =>
    record(tx, {
      organizationId: user.orgId,
      actorUserId: user.id,
      actorApiKeyId: null,
      action,
      resourceType: "eval_provider",
      resourceId,
      before: null,
      after: after as Record<string, unknown>,
      transport: ctx.transport,
      sourceIp: ctx.sourceIp ?? null,
    });
}

/** Admin-only. `apiKey` may be omitted to keep the stored key while changing the model list. The key is never audited. */
export async function setEvalProvider(
  db: Db,
  actingUser: UserSummary,
  params: { provider: string; apiKey?: string; models: string[] },
  auditContext: AuditContext = DEFAULT_WEB_AUDIT_CONTEXT,
) {
  requireAdmin(actingUser);
  const provider = params.provider as EvalProviderId;
  if (!EVAL_PROVIDER_IDS.includes(provider)) throw new InvalidEvalRequestError(`Unknown provider "${params.provider}".`);
  const models = [...new Set(params.models.map((m) => m.trim()).filter(Boolean))];
  if (models.length === 0) throw new InvalidEvalRequestError("At least one model id is required.");
  const existing = (await listProviderConfigs(db, actingUser.orgId)).find((r) => r.provider === provider);
  const apiKey = params.apiKey?.trim();
  if (!apiKey && !existing) throw new InvalidEvalRequestError("An API key is required for a new provider.");
  const apiKeyEnc = apiKey ? sealSecret(apiKey) : existing!.apiKeyEnc;
  await withAudit(
    db,
    (tx) => upsertProviderConfig(tx, { organizationId: actingUser.orgId, provider, apiKeyEnc, models, updatedBy: actingUser.id }),
    audit(actingUser, auditContext, "eval_provider.configured", actingUser.orgId, { provider, models, keyChanged: Boolean(apiKey) }),
  );
}

export async function removeEvalProvider(
  db: Db,
  actingUser: UserSummary,
  provider: string,
  auditContext: AuditContext = DEFAULT_WEB_AUDIT_CONTEXT,
) {
  requireAdmin(actingUser);
  if (!EVAL_PROVIDER_IDS.includes(provider as EvalProviderId)) throw new InvalidEvalRequestError(`Unknown provider "${provider}".`);
  await withAudit(
    db,
    (tx) => deleteProviderConfig(tx, actingUser.orgId, provider as EvalProviderId),
    audit(actingUser, auditContext, "eval_provider.removed", actingUser.orgId, { provider }),
  );
}

export async function setEvalDefaultJudge(
  db: Db,
  actingUser: UserSummary,
  defaultJudge: string | null,
  auditContext: AuditContext = DEFAULT_WEB_AUDIT_CONTEXT,
) {
  requireAdmin(actingUser);
  await withAudit(
    db,
    (tx) => upsertDefaultJudge(tx, actingUser.orgId, defaultJudge, actingUser.id),
    audit(actingUser, auditContext, "eval_settings.judge_set", actingUser.orgId, { defaultJudge }),
  );
}

/**
 * The org's live pool, built from its stored provider configs. A pool set via
 * `setEvalProviderPool` (tests) wins. Must run inside `withTenantContext`.
 */
export async function resolveEvalProviderPool(db: Db, organizationId: string): Promise<EvalProviderPool> {
  const seam = getEvalProviderPool();
  if (seam.providers.length > 0) return seam;
  const rows = await listProviderConfigs(db, organizationId);
  const defaultJudge = (await getDefaultJudge(db, organizationId)) ?? undefined;
  return {
    providers: rows.map((r) => createEvalProvider(r.provider, openSecret(r.apiKeyEnc))),
    models: rows.flatMap((r) => r.models.map((m) => `${r.provider}/${m}`)),
    defaultJudge,
  };
}
