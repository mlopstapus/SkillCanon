import { sql } from "drizzle-orm";
import { boolean, check, index, integer, text, timestamp, uuid } from "drizzle-orm/pg-core";
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
