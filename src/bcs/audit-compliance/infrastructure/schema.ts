import { index, jsonb, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { id } from "@/shared/db/columns";
import { auditSchema } from "@/shared/db/schemas";

/**
 * Append-only audit trail (003-audit-compliance/001, pulled forward by
 * 008-jwt-session-auth's Clarifications — schema/write-path only, not the
 * retrofit of already-shipped identity-access mutations).
 *
 * `organization_id` has no FK, matching every other `organization_id`
 * column already in this codebase (`identity_access.teams`/`users`), and is
 * nullable for exactly one case: a failed login against an email that
 * matches no account at all, where no organization is resolvable (FR-011).
 */
export const auditEvents = auditSchema.table(
  "audit_events",
  {
    id: id(),
    organizationId: uuid("organization_id"),
    actorUserId: uuid("actor_user_id"),
    actorApiKeyId: uuid("actor_api_key_id"),
    action: text("action").notNull(),
    resourceType: text("resource_type").notNull(),
    resourceId: uuid("resource_id"),
    before: jsonb("before"),
    after: jsonb("after"),
    transport: text("transport", { enum: ["web", "api", "cli", "system"] })
      .notNull(),
    sourceIp: text("source_ip"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [index().on(table.organizationId, table.createdAt)],
);
