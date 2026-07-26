ALTER TABLE "audit"."audit_events" ADD COLUMN "transport" text;--> statement-breakpoint
UPDATE "audit"."audit_events" SET "transport" = 'web' WHERE "transport" IS NULL;--> statement-breakpoint
ALTER TABLE "audit"."audit_events" ALTER COLUMN "transport" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "audit"."audit_events" ADD COLUMN "source_ip" text;--> statement-breakpoint
ALTER TABLE "audit"."audit_events" ADD CONSTRAINT "audit_events_transport_check" CHECK ("transport" IN ('web', 'api', 'cli', 'system'));
