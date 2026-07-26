import { sql } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import {
  DEFAULT_WEB_AUDIT_CONTEXT,
  record,
  type AuditContext,
} from "@/bcs/audit-compliance";
import { isSelfHosted } from "../domain/deployment-mode";
import { SecondOrganizationNotAllowedError } from "../domain/organization";
import {
  count,
  insert,
  type InsertOrganizationParams,
} from "../infrastructure/organizations-repo";

type Tx = PostgresJsDatabase<Record<string, never>>;

export interface AuditMutationOptions {
  audit?: boolean;
  auditContext?: AuditContext;
}

/**
 * Arbitrary, application-specific advisory-lock key — serializes concurrent
 * organization-bootstrap attempts against the same Postgres instance
 * (research.md §3). Not tied to any row or entity; just a constant every
 * caller of createOrganization agrees on.
 */
const ORGANIZATION_BOOTSTRAP_LOCK_KEY = 892_737_465;

const UNIQUE_VIOLATION = "23505";

/**
 * Guarded organization insert (FR-002, FR-006): in self-hosted mode, rejects
 * a second organization before writing anything; the `slug` uniqueness
 * constraint (enforced at the DB level regardless of mode) surfaces as a
 * clean thrown error rather than a raw driver error.
 *
 * Must be called from within an existing transaction (`tx`) so the
 * organization row and audit event commit or roll back together.
 */
export async function createOrganization(
  tx: Tx,
  params: InsertOrganizationParams,
  options: AuditMutationOptions = {},
): Promise<{ id: string }> {
  const selfHosted = isSelfHosted();

  if (selfHosted) {
    await tx.execute(
      sql`select pg_advisory_xact_lock(${ORGANIZATION_BOOTSTRAP_LOCK_KEY})`,
    );
    if ((await count(tx)) > 0) {
      throw new SecondOrganizationNotAllowedError();
    }
  }

  try {
    const result = await insert(tx, params);
    if (options.audit !== false) {
      const auditContext = options.auditContext ?? DEFAULT_WEB_AUDIT_CONTEXT;
      await record(tx, {
        organizationId: result.id,
        actorUserId: null,
        actorApiKeyId: null,
        action: "organization.created",
        resourceType: "organization",
        resourceId: result.id,
        before: null,
        after: { id: result.id, ...params },
        transport: auditContext.transport,
        sourceIp: auditContext.sourceIp ?? null,
      });
    }
    return result;
  } catch (err) {
    if (isUniqueViolation(err)) {
      throw new Error(
        `An organization with slug "${params.slug}" already exists.`,
      );
    }
    throw err;
  }
}

function isUniqueViolation(err: unknown): boolean {
  if (typeof err !== "object" || err === null) {
    return false;
  }
  if ("code" in err && (err as { code?: unknown }).code === UNIQUE_VIOLATION) {
    return true;
  }
  const cause = (err as { cause?: unknown }).cause;
  return (
    typeof cause === "object" &&
    cause !== null &&
    "code" in cause &&
    (cause as { code?: unknown }).code === UNIQUE_VIOLATION
  );
}
