import {
  type AnyPgColumn,
  boolean,
  index,
  integer,
  jsonb,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";
import { id, organizationId, timestamps } from "@/shared/db/columns";
import { promptRegistrySchema } from "@/shared/db/schemas";
import type { ChainStep } from "../domain/skill-chain";

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
 *
 * A version is one of two kinds (PDR-017), discriminated explicitly by
 * `kind` — never inferred from which of `system_template`/`user_template`/
 * `steps` happen to be null: a **template** version (`kind: "template"`,
 * `system_template`/`user_template`) resolved in a single `expand()` call,
 * or a **chain** version (`kind: "chain"`, `steps`) resolved across
 * multiple caller-driven `startSkillChainRun`/`advanceSkillChainRun` calls.
 * `steps` is null for every template version; every row published before
 * this discriminant existed defaults to `kind: "template"`, which is
 * simply true for all of them.
 */
export const promptVersions = promptRegistrySchema.table(
  "prompt_versions",
  {
    id: id(),
    promptId: uuid("prompt_id")
      .notNull()
      .references(() => prompts.id, { onDelete: "cascade" }),
    version: text("version").notNull(),
    kind: text("kind", { enum: ["template", "chain"] }).notNull().default("template"),
    /**
     * Legacy content columns (032-skill-file-format-refactor, PDR-018):
     * read-only going forward. Every version published before this feature
     * shipped keeps its content here, resolved unchanged (FR-010/FR-011).
     * No new version may be published in this shape — new template-kind
     * versions store their content in `promptVersionFiles` instead. A
     * version is "new-shape" iff it has a `promptVersionFiles` row with
     * `isMain: true`; there is no separate discriminant column for this.
     */
    systemTemplate: text("system_template"),
    userTemplate: text("user_template"),
    steps: jsonb("steps").$type<ChainStep[]>(),
    tags: jsonb("tags").notNull().default([]),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    unique("prompt_versions_prompt_id_version_unique").on(table.promptId, table.version),
    index("prompt_versions_prompt_id_created_at_index").on(table.promptId, table.createdAt),
  ],
);

/**
 * A named file (main or supporting) belonging to one template-kind
 * `promptVersions` row (032-skill-file-format-refactor, PDR-018). Exactly
 * one row per version has `isMain: true` (the required `SKILL.md`,
 * application-enforced, not a DB constraint); zero or more have
 * `isMain: false` (supporting files, unique name per version). Immutable
 * once published, same as `promptVersions` itself — no update/delete path
 * exists for a published version's files.
 */
export const promptVersionFiles = promptRegistrySchema.table(
  "prompt_version_files",
  {
    id: id(),
    promptVersionId: uuid("prompt_version_id")
      .notNull()
      .references(() => promptVersions.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    content: text("content").notNull(),
    isMain: boolean("is_main").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    unique("prompt_version_files_prompt_version_id_name_unique").on(table.promptVersionId, table.name),
    index("prompt_version_files_prompt_version_id_index").on(table.promptVersionId),
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
    subscriberType: text("subscriber_type", { enum: ["user", "team", "project"] }).notNull(),
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

/**
 * Git repositories linked to a project (023-prompt-registry-views-ui, new
 * capability — no prior feature modeled this). No `organization_id` column
 * of its own; tenancy is resolved indirectly through the parent project,
 * the same shape as `project_teams`/`project_members`.
 */
export const projectRepos = promptRegistrySchema.table(
  "project_repos",
  {
    id: id(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    url: text("url").notNull(),
    branch: text("branch").notNull().default("main"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    unique("project_repos_project_id_url_unique").on(table.projectId, table.url),
    index("project_repos_project_id_index").on(table.projectId),
  ],
);

/**
 * One client-driven walk-through of a chain version's steps
 * (026-skill-chains, PDR-017 — absorbed from workflow-orchestration's
 * planned `workflow_runs`). `current_step_index` names the step the caller
 * must report on next. `user_id` is informational (who started the run) —
 * it is not an authorization gate on later advance/abandon calls, which
 * any org member with access to the underlying skill may make.
 *
 * `prompt_version_id` pins the run to the *exact* chain version resolved at
 * start time — a run always walks that version's immutable `steps` list to
 * the end, even if a newer chain version gets published on the same skill
 * mid-run (chain versions are immutable per-version, but which version a
 * given run is walking must be remembered explicitly; it is never
 * re-resolved from the skill's current active version on each advance
 * call).
 */
export const skillChainRuns = promptRegistrySchema.table(
  "skill_chain_runs",
  {
    id: id(),
    organizationId: organizationId(),
    promptId: uuid("prompt_id")
      .notNull()
      .references(() => prompts.id, { onDelete: "cascade" }),
    promptVersionId: uuid("prompt_version_id")
      .notNull()
      .references(() => promptVersions.id, { onDelete: "cascade" }),
    userId: uuid("user_id").notNull(),
    status: text("status", { enum: ["in_progress", "completed", "failed", "abandoned"] })
      .notNull()
      .default("in_progress"),
    currentStepIndex: integer("current_step_index").notNull().default(0),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
  },
  (table) => [
    index("skill_chain_runs_organization_id_prompt_id_started_at_index").on(
      table.organizationId,
      table.promptId,
      table.startedAt,
    ),
    index("skill_chain_runs_organization_id_status_index").on(table.organizationId, table.status),
  ],
);

/**
 * What was actually resolved/sent for one step within one run, and the
 * caller's self-reported outcome for it — never a model's real response,
 * since this context never receives one (026-skill-chains, PDR-017,
 * absorbed from workflow-orchestration's planned `workflow_run_steps`).
 * `reported_status` stays null until the caller advances past this step
 * (or forever, if the run is abandoned while this step is still pending).
 */
export const skillChainRunSteps = promptRegistrySchema.table(
  "skill_chain_run_steps",
  {
    id: id(),
    runId: uuid("run_id")
      .notNull()
      .references(() => skillChainRuns.id, { onDelete: "cascade" }),
    stepIndex: integer("step_index").notNull(),
    promptName: text("prompt_name").notNull(),
    promptVersion: text("prompt_version").notNull(),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }).notNull().defaultNow(),
    /**
     * The step's resolved expansion content (032-skill-file-format-refactor)
     * — replaces the old systemMessage/userMessage pair, mirroring
     * `ExpansionResult`'s own single-`content` shape, since a chain step's
     * target skill resolves through the same `expand()`.
     */
    content: text("content").notNull(),
    appliedPolicies: jsonb("applied_policies").notNull().default([]),
    objectives: jsonb("objectives").notNull().default([]),
    reportedStatus: text("reported_status", { enum: ["success", "error"] }),
    reportedOutput: text("reported_output"),
    reportedError: text("reported_error"),
  },
  (table) => [
    unique("skill_chain_run_steps_run_id_step_index_unique").on(table.runId, table.stepIndex),
  ],
);
