ALTER TABLE "audit"."audit_events" DROP CONSTRAINT "audit_events_transport_check";--> statement-breakpoint
ALTER TABLE "audit"."audit_events" ADD CONSTRAINT "audit_events_transport_check" CHECK ("transport" IN ('web', 'api', 'mcp', 'cli', 'system'));
