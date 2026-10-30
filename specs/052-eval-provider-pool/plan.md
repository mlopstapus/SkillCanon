# Plan 052

- Migration `0041_prompt_registry_eval_provider_configs`: table `prompt_registry.eval_provider_configs` (PK org+provider, RLS), column `eval_settings.default_judge`.
- Infrastructure: `secret-box.ts` (AES-GCM), `eval-providers.ts` (Anthropic Messages and OpenAI chat-completions over `fetch`, injectable for tests), repo functions in `eval-runs-repo.ts`.
- Application: `eval-provider-config.ts` (get masked, set, remove, set judge, `resolveEvalProviderPool`). The eval submit route now resolves the pool per org.
- REST: `GET/PUT/PATCH/DELETE /api/evals/providers`.
- UI: `/settings/eval-providers` (server page, client view, server actions) plus nav entry.
- Tests: secret box and provider clients (unit, mocked fetch); route test on Testcontainers (encryption, masking, key kept, pool drives submit, delete).
