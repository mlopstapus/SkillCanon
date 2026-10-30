ALTER TABLE "distribution"."feedback" ADD COLUMN "addressed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "distribution"."feedback" ADD COLUMN "addressed_in_version_id" uuid;