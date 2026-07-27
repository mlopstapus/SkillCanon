import { index, text, timestamp, unique, uuid } from "drizzle-orm/pg-core";
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
