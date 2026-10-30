-- Cross-org queue access for the eval worker (017/003 part 1b). The app role is tenant-scoped by RLS,
-- so the worker cannot list queued runs across orgs directly. These two functions are the only
-- cross-org surface: they return ids or flip stale runs, nothing else. The owner (the migration
-- role) bypasses RLS. Execution itself still happens per org under withTenantContext.
CREATE OR REPLACE FUNCTION prompt_registry.list_queued_eval_runs(p_limit integer)
RETURNS TABLE (id uuid, organization_id uuid)
LANGUAGE sql SECURITY DEFINER STABLE
SET search_path = pg_catalog, prompt_registry
AS $$
  SELECT r.id, r.organization_id FROM prompt_registry.eval_runs r
  WHERE r.status = 'queued' ORDER BY r.created_at LIMIT p_limit
$$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION prompt_registry.fail_stale_eval_runs(p_older_than_secs integer)
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, prompt_registry
AS $$
DECLARE n integer;
BEGIN
  UPDATE prompt_registry.eval_runs
     SET status = 'failed', error = 'The worker stopped before finishing this run.', finished_at = now()
   WHERE status = 'running' AND started_at < now() - make_interval(secs => p_older_than_secs);
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END $$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION prompt_registry.list_queued_eval_runs(integer) FROM PUBLIC;
--> statement-breakpoint
REVOKE ALL ON FUNCTION prompt_registry.fail_stale_eval_runs(integer) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION prompt_registry.list_queued_eval_runs(integer) TO skillcanon_app;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION prompt_registry.fail_stale_eval_runs(integer) TO skillcanon_app;
