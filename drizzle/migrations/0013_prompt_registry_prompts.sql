CREATE TABLE "prompt_registry"."prompts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"is_deprecated" boolean DEFAULT false NOT NULL,
	"active_version_id" uuid,
	"user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "prompts_organization_id_name_unique" UNIQUE("organization_id","name")
);
--> statement-breakpoint
CREATE TABLE "prompt_registry"."prompt_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"prompt_id" uuid NOT NULL,
	"version" text NOT NULL,
	"system_template" text,
	"user_template" text,
	"input_schema" jsonb DEFAULT '{}' NOT NULL,
	"tags" jsonb DEFAULT '[]' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "prompt_versions_prompt_id_version_unique" UNIQUE("prompt_id","version")
);
--> statement-breakpoint
ALTER TABLE "prompt_registry"."prompt_versions" ADD CONSTRAINT "prompt_versions_prompt_id_prompts_id_fk" FOREIGN KEY ("prompt_id") REFERENCES "prompt_registry"."prompts"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "prompts_organization_id_name_index" ON "prompt_registry"."prompts" USING btree ("organization_id","name");
--> statement-breakpoint
CREATE INDEX "prompt_versions_prompt_id_created_at_index" ON "prompt_registry"."prompt_versions" USING btree ("prompt_id","created_at");
