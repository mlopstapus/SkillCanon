import { bigint, index, integer, jsonb, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { id, organizationId } from "@/shared/db/columns";
import { vcsIntegrationSchema } from "@/shared/db/schemas";

/**
 * One row per GitHub App installation. Never holds the App private key or an
 * installation access token (both are minted/read from env on demand).
 * `deleted_at` is a soft delete: repo links and PR check history must stay
 * readable after an uninstall (011-001, hard FKs everywhere else).
 */
export const installations = vcsIntegrationSchema.table(
  "installations",
  {
    id: id(),
    organizationId: organizationId(),
    githubInstallationId: bigint("github_installation_id", { mode: "number" }).notNull(),
    githubAccountLogin: text("github_account_login").notNull(),
    githubAccountType: text("github_account_type", { enum: ["Organization", "User"] }).notNull(),
    suspendedAt: timestamp("suspended_at", { withTimezone: true }),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("installations_github_installation_id_unique").on(table.githubInstallationId),
    index("installations_organization_id_index").on(table.organizationId),
  ],
);

/**
 * GitHub delivery ids already handled, so a redelivery is a no-op. No
 * organization column: a delivery is received before an org is resolved, so
 * this table is reachable only by the webhook role, never the app role.
 */
export const webhookDeliveries = vcsIntegrationSchema.table("webhook_deliveries", {
  deliveryId: text("delivery_id").primaryKey(),
  receivedAt: timestamp("received_at", { withTimezone: true }).notNull().defaultNow(),
});

/**
 * A GitHub repo (within an installation) linked to a SkillCanon project;
 * many-to-many. `unlinked_at` is a soft delete so PR check history for the
 * link stays queryable (OWNERSHIP.md: pr_checks are never truncated). The
 * uniqueness rule applies only to live links, so a project can be relinked.
 * `project_id` and `linked_by_user_id` carry no FK, matching other
 * cross-context ids in this codebase.
 */
export const repoLinks = vcsIntegrationSchema.table(
  "repo_links",
  {
    id: id(),
    organizationId: organizationId(),
    installationId: uuid("installation_id")
      .notNull()
      .references(() => installations.id),
    githubRepoId: bigint("github_repo_id", { mode: "number" }).notNull(),
    repoFullName: text("repo_full_name").notNull(),
    projectId: uuid("project_id").notNull(),
    linkedByUserId: uuid("linked_by_user_id").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    unlinkedAt: timestamp("unlinked_at", { withTimezone: true }),
  },
  (table) => [
    uniqueIndex("repo_links_live_unique")
      .on(table.installationId, table.githubRepoId, table.projectId)
      .where(sql`${table.unlinkedAt} is null`),
    index("repo_links_organization_id_project_id_index").on(table.organizationId, table.projectId),
    index("repo_links_github_repo_id_index").on(table.githubRepoId),
  ],
);

/**
 * One evaluation of a PR's required skills per (repo link, PR, head sha),
 * upserted when the same head is evaluated again. Real compliance history:
 * never truncated or rolled up (OWNERSHIP.md). `error` is set only for a
 * `neutral` (evaluation itself failed) row.
 */
export const prChecks = vcsIntegrationSchema.table(
  "pr_checks",
  {
    id: id(),
    organizationId: organizationId(),
    repoLinkId: uuid("repo_link_id")
      .notNull()
      .references(() => repoLinks.id),
    prNumber: integer("pr_number").notNull(),
    headSha: text("head_sha").notNull(),
    evaluatedAt: timestamp("evaluated_at", { withTimezone: true }).notNull().defaultNow(),
    results: jsonb("results").$type<Array<{ skillName: string; satisfied: boolean; matchedCommitSha: string | null }>>().notNull(),
    status: text("status", { enum: ["pass", "fail", "neutral"] }).notNull(),
    githubCheckRunId: bigint("github_check_run_id", { mode: "number" }),
    error: text("error"),
  },
  (table) => [
    uniqueIndex("pr_checks_link_pr_head_unique").on(table.repoLinkId, table.prNumber, table.headSha),
    index("pr_checks_organization_id_evaluated_at_index").on(table.organizationId, table.evaluatedAt),
  ],
);
