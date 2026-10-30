import { boolean, index, integer, jsonb, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { id, organizationId } from "@/shared/db/columns";
import { distributionSchema } from "@/shared/db/schemas";

/**
 * One row per genuine runtime usage event. Telemetry is product usage data,
 * not an audit trail: no rendered prompt content, raw input, or error detail
 * is stored here. `project_id`/`user_id`/git fields are optional context.
 */
export const promptUsage = distributionSchema.table(
  "prompt_usage",
  {
    id: id(),
    organizationId: organizationId(),
    promptId: uuid("prompt_id").notNull(),
    promptVersionId: uuid("prompt_version_id").notNull(),
    promptVersion: text("prompt_version").notNull().default("unknown"),
    projectId: uuid("project_id"),
    userId: uuid("user_id"),
    statusCode: integer("status_code").notNull().default(200),
    latencyMs: integer("latency_ms"),
    gitRemoteUrl: text("git_remote_url"),
    gitBranch: text("git_branch"),
    gitCommitSha: text("git_commit_sha"),
    /** SHA-256 (hex) of the exact composed text served; null for failed serves and pre-016 rows. */
    contentDigest: text("content_digest"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("prompt_usage_organization_id_created_at_index").on(table.organizationId, table.createdAt),
    index("prompt_usage_organization_id_status_code_index").on(table.organizationId, table.statusCode),
    index("prompt_usage_organization_id_prompt_id_index").on(table.organizationId, table.promptId),
    index("prompt_usage_project_id_created_at_index").on(table.projectId, table.createdAt),
    index("prompt_usage_project_id_prompt_id_index").on(table.projectId, table.promptId),
    index("prompt_usage_project_id_user_id_index").on(table.projectId, table.userId),
    index("prompt_usage_git_commit_sha_index").on(table.gitCommitSha),
  ],
);

/**
 * Feedback filed against one serve (016/002). Stores the serve id, never a
 * copy of the skill text. `organization_id` is carried directly for RLS.
 */
export const feedback = distributionSchema.table(
  "feedback",
  {
    id: id(),
    organizationId: organizationId(),
    serveId: uuid("serve_id")
      .notNull()
      .references(() => promptUsage.id),
    userId: uuid("user_id").notNull(),
    kind: text("kind", { enum: ["signal", "note"] }).notNull(),
    rating: text("rating", { enum: ["up", "down"] }),
    text: text("text"),
    /** Set when the skill's owner marks a note addressed (016/003). */
    addressedAt: timestamp("addressed_at", { withTimezone: true }),
    addressedInVersionId: uuid("addressed_in_version_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("feedback_organization_id_created_at_index").on(table.organizationId, table.createdAt),
    index("feedback_serve_id_index").on(table.serveId),
  ],
);

/**
 * A model-drafted improvement of one skill version, built from its open
 * feedback notes (016/004). Pending until the owner accepts (publishes a new
 * version) or dismisses it.
 */
export const feedbackDrafts = distributionSchema.table(
  "feedback_drafts",
  {
    id: id(),
    organizationId: organizationId(),
    promptId: uuid("prompt_id").notNull(),
    baseVersionId: uuid("base_version_id").notNull(),
    status: text("status", { enum: ["pending", "accepted", "dismissed"] }).notNull().default("pending"),
    proposedContent: text("proposed_content").notNull(),
    rationale: text("rationale").notNull().default(""),
    sourceFeedbackIds: jsonb("source_feedback_ids").$type<string[]>().notNull(),
    model: text("model").notNull(),
    createdBy: uuid("created_by").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    decidedBy: uuid("decided_by"),
    decidedAt: timestamp("decided_at", { withTimezone: true }),
    acceptedVersionId: uuid("accepted_version_id"),
  },
  (table) => [index("feedback_drafts_organization_id_prompt_id_index").on(table.organizationId, table.promptId)],
);

/**
 * Per-organization consent to send skill content and feedback text to the
 * operator-configured third-party model provider (Ben #1697 q5). Absent row =
 * not opted in. Shared by any feature that makes model calls.
 */
export const thirdPartyOptIn = distributionSchema.table("third_party_opt_in", {
  organizationId: organizationId().primaryKey(),
  enabled: boolean("enabled").notNull().default(false),
  updatedBy: uuid("updated_by"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});
