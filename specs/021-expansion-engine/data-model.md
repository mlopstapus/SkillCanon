# Data Model: Skill Expansion Engine

No new tables — this feature reads existing `prompt_registry.prompts`/`prompt_versions` and calls Governance's existing resolution functions. Its "data model" is the shape of its inputs/outputs and the inclusion-resolution algorithm.

## Types

### ExpandParams (input)

| Field | Type | Nullable | Notes |
|---|---|---|---|
| `organizationId` | string | No | Tenant scope for every lookup this call makes, including nested inclusions |
| `promptName` | string | No | The top-level skill to expand |
| `input` | `Record<string, unknown>` | No | Caller-supplied template variables |
| `userId` | string | Yes | Optional acting user — omitted means fully ungoverned (spec Clarification 1) |
| `projectId` | string | Yes | Optional project context — used **only** for objective resolution (Objective kept its project scope under PDR-016); never forwarded to policy resolution (FR-015). Meaningless without `userId` also given. |
| `version` | string | Yes | Optional explicit version pin for the *top-level* skill only; nested inclusions always resolve to their own current active version, never a pinned one |

### ExpansionResult (output)

| Field | Type | Notes |
|---|---|---|
| `systemMessage` | `string \| null` | `null` when the resolved version has no system template |
| `userMessage` | `string` | Always present — legacy defaults to `"{{ input }}"` when no user template exists, carried forward |
| `appliedPolicies` | `string[]` | Policy names actually applied; empty when no acting user or no effective policies |
| `objectives` | `string[]` | Objective titles resolved; empty when no acting user or no effective objectives (new field, spec Clarification 2) |

## The inclusion-resolution algorithm (exact legacy behavior, ported as-is)

```
expand(orgId, promptName, input, { userId?, version? }):
  1. Fetch the top-level skill's version (explicit `version` if given, else current active).
     - Not found, or the skill is deprecated → reject (ExpansionSourceNotFoundError).
  2. templateVars := shallow copy of `input`.
  3. If userId given:
       policies  := resolveAllPolicies(orgId, userId)              // no projectId — PDR-016
       objectives := resolveAllObjectives(orgId, userId, projectId) // projectId forwarded only here (FR-015)
       (systemTpl, userTpl, appliedNames) := applyPolicies(policies, systemTpl, userTpl, templateVars)
       if objectives non-empty: templateVars["objectives"] := objectives.join("\n")
     Else:
       appliedNames := [], objectives := []
  4. Scan systemTpl/userTpl raw text for `include_prompt('name')` references (regex prescan).
  5. Breadth-first prefetch every referenced skill's current active version, up to depth 3,
     building a name → version cache. (This is a batching optimization for step 6, not itself
     the depth enforcement.)
  6. Render systemTpl (if present) and userTpl through the template engine, with `include_prompt`
     registered as a callable global that:
       - at depth >= 3: returns a plain placeholder string, does not recurse further
       - when the name isn't in the prefetched cache: returns a plain "not found" placeholder
       - otherwise: recursively renders that skill's own system+user template (depth + 1) and
         returns the joined result
  7. Return { systemMessage, userMessage, appliedPolicies: appliedNames, objectives }.
```

## Relationships to existing entities (unchanged by this feature)

```
Prompt (skill) ──[active_version_id]──> PromptVersion   (existing, read-only here)
Policy ──resolveAllPolicies(orgId, userId)──> content applied to templates
Objective ──resolveAllObjectives(orgId, userId, projectId?)──> titles exposed as template context
```

No new persisted relationship — `include_prompt`'s skill-to-skill reference is resolved purely by name lookup at render time, never stored anywhere (a skill's own row has no "included skills" column or join table).
