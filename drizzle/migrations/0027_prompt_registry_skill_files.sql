-- 032-skill-file-format-refactor (PDR-018): a template-kind skill version's
-- content moves from a flat systemTemplate/userTemplate string to a
-- required main file plus zero or more named supporting files, stored one
-- row per file in prompt_version_files. input_schema was already unvalidated
-- dead weight (PDR-018 Context) and is dropped entirely. Every version
-- published before this migration keeps its system_template/user_template
-- content untouched and readable (no backfill, no auto-conversion).

CREATE TABLE "prompt_registry"."prompt_version_files" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"prompt_version_id" uuid NOT NULL,
	"name" text NOT NULL,
	"content" text NOT NULL,
	"is_main" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "prompt_version_files_prompt_version_id_name_unique" UNIQUE("prompt_version_id","name")
);
--> statement-breakpoint
ALTER TABLE "prompt_registry"."prompt_version_files" ADD CONSTRAINT "prompt_version_files_prompt_version_id_prompt_versions_id_fk" FOREIGN KEY ("prompt_version_id") REFERENCES "prompt_registry"."prompt_versions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "prompt_version_files_prompt_version_id_index" ON "prompt_registry"."prompt_version_files" USING btree ("prompt_version_id");--> statement-breakpoint
ALTER TABLE "prompt_registry"."prompt_versions" DROP COLUMN "input_schema";
--> statement-breakpoint

-- prompt_version_files has no organization_id column of its own; tenancy is
-- resolved indirectly through its parent version's parent prompt, mirroring
-- prompt_versions' own two-hop EXISTS pattern from 0019_prompt_registry_rls.sql.
ALTER TABLE "prompt_registry"."prompt_version_files" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "prompt_registry"."prompt_version_files" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "prompt_version_files_tenant_isolation" ON "prompt_registry"."prompt_version_files"
  TO skillcanon_app
  USING (
    EXISTS (
      SELECT 1
      FROM prompt_registry.prompt_versions
      JOIN prompt_registry.prompts ON prompts.id = prompt_versions.prompt_id
      WHERE prompt_versions.id = prompt_version_files.prompt_version_id
        AND prompts.organization_id = current_setting('app.current_org_id')::uuid
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM prompt_registry.prompt_versions
      JOIN prompt_registry.prompts ON prompts.id = prompt_versions.prompt_id
      WHERE prompt_versions.id = prompt_version_files.prompt_version_id
        AND prompts.organization_id = current_setting('app.current_org_id')::uuid
    )
  );