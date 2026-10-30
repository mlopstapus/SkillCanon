# Spec 052: Eval provider pool admin page (017/003 part 1c)

Backlog: `backlog/017-cross-model-evals/003-skillcanon-eval.md` part 1c. Governs: PDR-020, Ben's answers #1697 (1: pool on an admin page, 2: Anthropic and OpenAI).

## User story
An org admin opens Settings → Eval providers, enters an Anthropic and/or OpenAI API key and the allowed model ids, optionally sets a default judge, and turns evals on. Submitting an eval run then draws on that pool. Users never supply keys.

## Requirements
- FR-1 Admin-only writes (`NotAuthorizedError` otherwise); any member may read the config.
- FR-2 Keys are AES-256-GCM encrypted at rest and never returned by any API or page; reads expose only "key set".
- FR-3 Omitting the key on update keeps the stored key. A new provider requires a key (422).
- FR-4 Providers are `anthropic` and `openai`; allowed models are stored per provider and exposed as `<provider>/<model>`.
- FR-5 `resolveEvalProviderPool(db, orgId)` builds the live pool from stored config. The `setEvalProviderPool` test seam still wins when set.
- FR-6 Every change is audited (`eval_provider.configured|removed`, `eval_settings.judge_set`); the key is never in the audit payload.
- FR-7 The pool is per organization (one table, RLS). The worker (1b) loads each run's org pool in that org's tenant context.

## Out of scope
Worker process (1b), CLI (2), key rotation tooling. Encryption key derives from `JWT_SECRET`: rotating it invalidates stored provider keys (recorded as a `shortcut:` in `secret-box.ts`).
