# Contract: Policies, Objectives (governance)

All endpoints require auth per `error-shape.contract.md`.

| Method | Path | BC call |
|---|---|---|
| POST | `/api/policies` | `createPolicy(tx, params, auditContext)` |
| GET | `/api/policies?teamId=` | `listTeamPolicies(tx, orgId, teamId)` — `teamId` required |
| GET | `/api/policies/effective?userId=` | `resolveEffectivePolicies(tx, orgId, userId)` — `userId` defaults to caller's own id if omitted |
| GET | `/api/policies/{policyId}` | `getPolicy(tx, orgId, policyId)` |
| PUT | `/api/policies/{policyId}` | `updatePolicy(orgId, policyId, fields, auditContext)` — team authorization inside |
| DELETE | `/api/policies/{policyId}` | `deletePolicy(orgId, policyId, auditContext)` |
| POST | `/api/objectives` | `createObjective(tx, params, auditContext)` |
| GET | `/api/objectives?teamId=\|userId=\|projectId=` | dispatches to `listTeamObjectives` / `listUserObjectives` / `listProjectObjectives` — exactly one of the three query params required |
| GET | `/api/objectives/effective?userId=&projectId=` | `resolveEffectiveObjectives(tx, orgId, userId, projectId?)` — `userId` defaults to caller's own id if omitted |
| GET | `/api/objectives/{objectiveId}` | `getObjective(tx, orgId, objectiveId)` |
| PUT | `/api/objectives/{objectiveId}` | `updateObjective(orgId, objectiveId, fields, auditContext)` |
| DELETE | `/api/objectives/{objectiveId}` | `deleteObjective(orgId, objectiveId, auditContext)` |

`GET /api/policies` / `GET /api/objectives` return `422 VALIDATION_FAILED` for zero or more than one scoping query param — see research.md's "list semantics" decision.
