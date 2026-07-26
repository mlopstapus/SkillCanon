import { sql } from "drizzle-orm";
import {
  type AnyPgColumn,
  boolean,
  check,
  index,
  integer,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { id, organizationId } from "@/shared/db/columns";
import { governanceSchema } from "@/shared/db/schemas";

export const policies = governanceSchema.table(
  "policies",
  {
    id: id(),
    organizationId: organizationId(),
    teamId: uuid("team_id"),
    projectId: uuid("project_id"),
    name: text("name").notNull(),
    description: text("description"),
    enforcementType: text("enforcement_type", {
      enum: ["prepend", "append", "inject", "validate"],
    }).notNull(),
    content: text("content").notNull(),
    priority: integer("priority").notNull().default(0),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index().on(table.organizationId, table.teamId, table.isActive, table.priority),
    index().on(table.organizationId, table.projectId, table.isActive, table.priority),
    check(
      "policies_exactly_one_scope",
      sql`(${table.teamId} is null) <> (${table.projectId} is null)`,
    ),
  ],
);

export const objectives = governanceSchema.table(
  "objectives",
  {
    id: id(),
    organizationId: organizationId(),
    teamId: uuid("team_id"),
    projectId: uuid("project_id"),
    userId: uuid("user_id"),
    title: text("title").notNull(),
    description: text("description"),
    parentObjectiveId: uuid("parent_objective_id").references(
      (): AnyPgColumn => objectives.id,
      { onDelete: "set null" },
    ),
    isInherited: boolean("is_inherited").notNull().default(false),
    status: text("status").notNull().default("active"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index().on(table.organizationId, table.teamId, table.status, table.createdAt),
    index().on(table.organizationId, table.projectId, table.status, table.createdAt),
    index().on(table.organizationId, table.userId, table.status, table.createdAt),
    index().on(table.organizationId, table.parentObjectiveId),
    check(
      "objectives_not_self_parent",
      sql`${table.parentObjectiveId} is null or ${table.parentObjectiveId} <> ${table.id}`,
    ),
  ],
);
