CREATE TABLE "prompt_registry"."subscriptions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"source_skill_id" uuid NOT NULL,
	"subscriber_type" text NOT NULL,
	"subscriber_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "subscriptions_source_skill_id_subscriber_unique" UNIQUE("source_skill_id","subscriber_type","subscriber_id")
);
--> statement-breakpoint
ALTER TABLE "prompt_registry"."subscriptions" ADD CONSTRAINT "subscriptions_source_skill_id_prompts_id_fk" FOREIGN KEY ("source_skill_id") REFERENCES "prompt_registry"."prompts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "subscriptions_organization_id_subscriber_index" ON "prompt_registry"."subscriptions" USING btree ("organization_id","subscriber_type","subscriber_id");--> statement-breakpoint
CREATE INDEX "subscriptions_source_skill_id_index" ON "prompt_registry"."subscriptions" USING btree ("source_skill_id");