import { index, timestamp, uuid } from "drizzle-orm/pg-core";
import { id, organizationId } from "@/shared/db/columns";
import { distributionSchema } from "@/shared/db/schemas";

/**
 * One row per genuine (non-test, non-preview) prompt expansion (spec
 * FR-001/FR-002a of 024-project-usage-metrics-dashboard). Immutable,
 * append-only — no `updated_at`. `project_id`/`user_id` are nullable:
 * null `project_id` means an ad hoc/personal expansion (excluded from every
 * project-scoped view, never dropped); null `user_id` means an ungoverned
 * invocation with no acting user. No FKs on `prompt_id`/`prompt_version_id`/
 * `project_id`/`user_id` — opaque cross-schema references, matching this
 * repo's established no-cross-schema-FK convention.
 */
export const promptUsage = distributionSchema.table(
  "prompt_usage",
  {
    id: id(),
    organizationId: organizationId(),
    promptId: uuid("prompt_id").notNull(),
    promptVersionId: uuid("prompt_version_id").notNull(),
    projectId: uuid("project_id"),
    userId: uuid("user_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("prompt_usage_project_id_created_at_index").on(table.projectId, table.createdAt),
    index("prompt_usage_project_id_prompt_id_index").on(table.projectId, table.promptId),
    index("prompt_usage_project_id_user_id_index").on(table.projectId, table.userId),
  ],
);
