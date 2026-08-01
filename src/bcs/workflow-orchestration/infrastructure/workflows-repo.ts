import { and, desc, eq, sql } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import type { WorkflowStep } from "../domain/workflow";
import { workflows } from "./schema";

type Tx = PostgresJsDatabase<Record<string, never>>;

export interface InsertWorkflowParams {
  id: string;
  organizationId: string;
  userId: string;
  projectId: string | null;
  name: string;
  description: string | null;
  steps: WorkflowStep[];
}

export async function insert(tx: Tx, params: InsertWorkflowParams) {
  const [row] = await tx.insert(workflows).values(params).returning();
  if (!row) {
    throw new Error("Workflow insert returned no row.");
  }
  return row;
}

export async function findByOrgAndId(tx: Tx, organizationId: string, workflowId: string) {
  const [row] = await tx
    .select()
    .from(workflows)
    .where(and(eq(workflows.organizationId, organizationId), eq(workflows.id, workflowId)));
  return row ?? null;
}

export interface UpdateWorkflowFieldsRow {
  name?: string;
  description?: string | null;
  steps?: WorkflowStep[];
}

export async function update(
  tx: Tx,
  organizationId: string,
  workflowId: string,
  fields: UpdateWorkflowFieldsRow,
) {
  const [row] = await tx
    .update(workflows)
    .set({ ...fields, updatedAt: sql`now()` })
    .where(and(eq(workflows.organizationId, organizationId), eq(workflows.id, workflowId)))
    .returning();
  return row ?? null;
}

export async function listByOrgAndUser(tx: Tx, organizationId: string, userId: string, projectId?: string) {
  return tx
    .select()
    .from(workflows)
    .where(
      and(
        eq(workflows.organizationId, organizationId),
        eq(workflows.userId, userId),
        projectId !== undefined ? eq(workflows.projectId, projectId) : undefined,
      ),
    )
    .orderBy(desc(workflows.updatedAt));
}

export async function listByOrgAndProject(tx: Tx, organizationId: string, projectId: string) {
  return tx
    .select()
    .from(workflows)
    .where(and(eq(workflows.organizationId, organizationId), eq(workflows.projectId, projectId)))
    .orderBy(desc(workflows.updatedAt));
}

export async function listByOrg(tx: Tx, organizationId: string) {
  return tx
    .select()
    .from(workflows)
    .where(eq(workflows.organizationId, organizationId))
    .orderBy(desc(workflows.updatedAt));
}
