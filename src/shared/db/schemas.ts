import { pgSchema } from "drizzle-orm/pg-core";

export const SCHEMAS = {
  identityAccess: "identity_access",
  governance: "governance",
  promptRegistry: "prompt_registry",
  billing: "billing",
  audit: "audit",
  distribution: "distribution",
} as const;

export type SchemaName = (typeof SCHEMAS)[keyof typeof SCHEMAS];

// Exported so `drizzle-kit generate` picks these up as schema-creation
// statements (FR-003) even before any bounded context has tables of its own.
export const identityAccessSchema = pgSchema(SCHEMAS.identityAccess);
export const governanceSchema = pgSchema(SCHEMAS.governance);
export const promptRegistrySchema = pgSchema(SCHEMAS.promptRegistry);
export const billingSchema = pgSchema(SCHEMAS.billing);
export const auditSchema = pgSchema(SCHEMAS.audit);
export const distributionSchema = pgSchema(SCHEMAS.distribution);
