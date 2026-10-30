import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import type { Feedback } from "../domain/feedback";
import { feedback } from "./schema";

export interface InsertFeedbackParams {
  id: string;
  organizationId: string;
  serveId: string;
  userId: string;
  kind: Feedback["kind"];
  rating: Feedback["rating"];
  text: string | null;
}

export async function insert<TSchema extends Record<string, unknown>>(
  tx: PostgresJsDatabase<TSchema>,
  params: InsertFeedbackParams,
): Promise<Feedback> {
  const [row] = await tx.insert(feedback).values(params).returning();
  if (!row) throw new Error("feedback insert returned no row.");
  return {
    id: row.id,
    serveId: row.serveId,
    userId: row.userId,
    kind: row.kind,
    rating: row.rating,
    text: row.text,
    createdAt: row.createdAt,
  };
}
