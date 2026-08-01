import { index, jsonb, text, uuid } from "drizzle-orm/pg-core";
import { id, organizationId, timestamps } from "@/shared/db/columns";
import { workflowSchema } from "@/shared/db/schemas";
import type { WorkflowStep } from "../domain/workflow";

export const workflows = workflowSchema.table(
  "workflows",
  {
    id: id(),
    organizationId: organizationId(),
    userId: uuid("user_id").notNull(),
    projectId: uuid("project_id"),
    name: text("name").notNull(),
    description: text("description"),
    steps: jsonb("steps").$type<WorkflowStep[]>().notNull().default([]),
    ...timestamps(),
  },
  (table) => [
    index("workflows_organization_id_user_id_index").on(table.organizationId, table.userId),
    index("workflows_organization_id_project_id_index").on(table.organizationId, table.projectId),
    index("workflows_organization_id_updated_at_index").on(table.organizationId, table.updatedAt),
  ],
);
