import { boolean, index, jsonb, text, timestamp, unique, uuid } from "drizzle-orm/pg-core";
import { id, organizationId, timestamps } from "@/shared/db/columns";
import { promptRegistrySchema } from "@/shared/db/schemas";

export const projects = promptRegistrySchema.table(
  "projects",
  {
    id: id(),
    organizationId: organizationId(),
    teamId: uuid("team_id").notNull(),
    leadUserId: uuid("lead_user_id"),
    name: text("name").notNull(),
    slug: text("slug").notNull(),
    description: text("description"),
    ...timestamps(),
  },
  (table) => [
    unique("projects_organization_id_name_unique").on(table.organizationId, table.name),
    unique("projects_organization_id_slug_unique").on(table.organizationId, table.slug),
    index("projects_organization_id_name_index").on(table.organizationId, table.name),
    index("projects_organization_id_team_id_name_index").on(
      table.organizationId,
      table.teamId,
      table.name,
    ),
  ],
);

export const projectMembers = promptRegistrySchema.table(
  "project_members",
  {
    id: id(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    userId: uuid("user_id").notNull(),
    role: text("role").notNull().default("member"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    unique("project_members_project_id_user_id_unique").on(table.projectId, table.userId),
    index("project_members_project_id_created_at_index").on(table.projectId, table.createdAt),
    index("project_members_user_id_index").on(table.userId),
  ],
);

/**
 * Organization-scoped prompt definitions.
 * Name uniqueness is per-organization (NOT global — correcting the legacy schema).
 * `active_version_id` is nullable; it points to the currently active PromptVersion.
 */
export const prompts = promptRegistrySchema.table(
  "prompts",
  {
    id: id(),
    organizationId: organizationId(),
    name: text("name").notNull(),
    description: text("description"),
    isDeprecated: boolean("is_deprecated").notNull().default(false),
    /** Nullable until first version is published. Updated by publishVersion and rollback. */
    activeVersionId: uuid("active_version_id"),
    /** Optional owner user — must belong to the same organization. */
    userId: uuid("user_id"),
    ...timestamps(),
  },
  (table) => [
    unique("prompts_organization_id_name_unique").on(table.organizationId, table.name),
    index("prompts_organization_id_name_index").on(table.organizationId, table.name),
  ],
);

/**
 * Immutable prompt version records. Once created, no application service
 * may update any field on an existing row — only new rows are ever inserted.
 */
export const promptVersions = promptRegistrySchema.table(
  "prompt_versions",
  {
    id: id(),
    promptId: uuid("prompt_id")
      .notNull()
      .references(() => prompts.id, { onDelete: "cascade" }),
    version: text("version").notNull(),
    systemTemplate: text("system_template"),
    userTemplate: text("user_template"),
    inputSchema: jsonb("input_schema").notNull().default({}),
    tags: jsonb("tags").notNull().default([]),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    unique("prompt_versions_prompt_id_version_unique").on(table.promptId, table.version),
    index("prompt_versions_prompt_id_created_at_index").on(table.promptId, table.createdAt),
  ],
);
