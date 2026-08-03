# Contract: Skills, Versions, Sharing, Chain Runs (prompt-registry)

All endpoints require auth per `error-shape.contract.md` (expand and chain-run endpoints are **not** anonymous, unlike the legacy Python API — FR-010 has no session-only/anonymous carve-out).

| Method | Path | BC call |
|---|---|---|
| POST | `/api/skills` | `createPrompt(tx, params)` |
| GET | `/api/skills` | `listPrompts(tx, { organizationId, userId }, { projectId? })` — paginated (FR-015) |
| GET | `/api/skills/{name}` | `getPrompt(tx, orgId, name)` |
| DELETE | `/api/skills/{name}` | `deprecatePrompt(tx, actor, name, auditContext)` |
| POST | `/api/skills/{name}/versions` | `publishVersion(tx, { organizationId, promptId, version, kind, ... }, auditContext)` — `promptId` resolved from `name` first |
| GET | `/api/skills/{name}/versions` | `listVersions(tx, orgId, promptId)` |
| POST | `/api/skills/{name}/rollback` | `rollbackPrompt(tx, orgId, name, version)` — body `{ version }` |
| POST | `/api/skills/{name}/expand` | `expand(tx, { organizationId, promptName: name, input, userId, projectId?, version? })` |
| POST | `/api/skills/{name}/subscriptions` | `subscribeSkill(tx, actingUser, sourceSkillId, { subscriberType, subscriberId }, auditContext)` |
| GET | `/api/skills/{name}/subscriptions` | `listSubscriptionsForSkill(tx, orgId, sourceSkillId)` |
| DELETE | `/api/skills/{name}/subscriptions/{subscriptionId}` | `unsubscribeSkill(tx, actingUser, subscriptionId, auditContext)` |
| POST | `/api/skills/{name}/fork` | `forkSkill(tx, actingUser, sourceSkillId, { ownerType, ownerId }, auditContext)` |
| POST | `/api/skills/{name}/chain-runs` | `startSkillChainRun(tx, actor, name, version?)` |
| GET | `/api/skills/{name}/chain-runs` | `listSkillChainRuns(tx, orgId, promptId)` |
| GET | `/api/chain-runs/{runId}` | `getSkillChainRun(tx, orgId, runId)` |
| POST | `/api/chain-runs/{runId}/advance` | `advanceSkillChainRun(tx, actor, runId, { stepIndex, status, output?, error? })` |
| POST | `/api/chain-runs/{runId}/abandon` | `abandonSkillChainRun(tx, actor, runId, auditContext)` |

No `POST /api/skills/{name}/chain-runs/run` (synchronous run-to-completion) — confirmed out of scope, FR-009 / 2026-08-02 clarification.
