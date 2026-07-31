import {
  type AnyPgColumn,
  boolean,
  index,
  jsonb,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";
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

/**
 * Collaborator teams on a project (022-project-skill-assignment, pulled
 * forward from `backlog/006-prompt-registry/001-project-model-and-membership.md`
 * per PDR-016). The project's *owner* team is `projects.team_id` — it is
 * never a row in this table. A team's participation in a project is the
 * union of `projects.team_id` and whatever rows exist here for that project.
 */
export const projectTeams = promptRegistrySchema.table(
  "project_teams",
  {
    id: id(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    teamId: uuid("team_id").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    unique("project_teams_project_id_team_id_unique").on(table.projectId, table.teamId),
    index("project_teams_project_id_index").on(table.projectId),
    index("project_teams_team_id_index").on(table.teamId),
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
 * Organization-scoped prompt definitions ("skills").
 * Name uniqueness is per-organization (NOT global — correcting the legacy schema).
 * `active_version_id` is nullable; it points to the currently active PromptVersion.
 *
 * Ownership (PDR-016): every skill is owned by exactly one user or exactly
 * one team, never derived from a project — `ownerType`/`ownerId` are always
 * set from creation. `forkedFromSkillId` is a self-referencing lineage
 * pointer, set only when this skill was created via `forkSkill` (fork
 * itself is future work — this column just exists for it).
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
    ownerType: text("owner_type", { enum: ["user", "team"] }).notNull(),
    ownerId: uuid("owner_id").notNull(),
    forkedFromSkillId: uuid("forked_from_skill_id").references(
      (): AnyPgColumn => prompts.id,
      { onDelete: "set null" },
    ),
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

/**
 * A live-reference sharing grant from one skill to one subscriber (a user or
 * a team), scoped within a single organization (020-prompt-sharing, PDR-016).
 * `subscriber_id` carries no FK — polymorphic, points at either
 * `identity_access.users.id` or `identity_access.teams.id` depending on
 * `subscriber_type`, the same "opaque id, no cross-schema FK" convention
 * already used for `organization_id` everywhere in this repo. A subscription
 * has exactly two states, present or absent — there is no "inactive" row;
 * removal is a hard delete (`unsubscribeSkill`).
 */
export const subscriptions = promptRegistrySchema.table(
  "subscriptions",
  {
    id: id(),
    organizationId: organizationId(),
    sourceSkillId: uuid("source_skill_id")
      .notNull()
      .references(() => prompts.id, { onDelete: "cascade" }),
    subscriberType: text("subscriber_type", { enum: ["user", "team"] }).notNull(),
    subscriberId: uuid("subscriber_id").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    unique("subscriptions_source_skill_id_subscriber_unique").on(
      table.sourceSkillId,
      table.subscriberType,
      table.subscriberId,
    ),
    index("subscriptions_organization_id_subscriber_index").on(
      table.organizationId,
      table.subscriberType,
      table.subscriberId,
    ),
    index("subscriptions_source_skill_id_index").on(table.sourceSkillId),
  ],
);

/**
 * A project's declared catalog fact (022-project-skill-assignment, PDR-016):
 * which skills apply to it, and whether each is `required` or `optional`.
 * Not a Governance policy and not resolved through any team-inheritance
 * chain — a direct, project-scoped fact `listRequiredSkillsForProject`
 * reads flatly. `organization_id` is denormalized here (not re-derived via
 * a join to `projects` on every read) for the same reason
 * `subscriptions.organization_id` is: uniform query/RLS scoping.
 */
export const projectSkillAssignments = promptRegistrySchema.table(
  "project_skill_assignments",
  {
    id: id(),
    organizationId: organizationId(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    skillId: uuid("skill_id")
      .notNull()
      .references(() => prompts.id, { onDelete: "cascade" }),
    requirement: text("requirement", { enum: ["required", "optional"] }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    unique("project_skill_assignments_project_id_skill_id_unique").on(
      table.projectId,
      table.skillId,
    ),
    index("project_skill_assignments_project_id_requirement_index").on(
      table.projectId,
      table.requirement,
    ),
    index("project_skill_assignments_skill_id_index").on(table.skillId),
  ],
);
