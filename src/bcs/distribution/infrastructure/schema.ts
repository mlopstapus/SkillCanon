import { index, integer, text, timestamp, uuid } from "drizzle-orm/pg-core";
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
