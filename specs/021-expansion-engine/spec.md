# Feature Specification: Skill Expansion Engine

**Feature Branch**: `021-expansion-engine`

**Created**: 2026-07-29

**Status**: Clarified

**Input**: User description: "Expansion Engine (epic 006-prompt-registry, backlog item backlog/006-prompt-registry/004-expansion-engine.md, depends on 002-prompt-and-version-model and Governance's hierarchical resolution engine). Port expand_prompt from the legacy Python prompt_service.py into the prompt-registry bounded context — the actual 'run a skill' operation every other part of the system exists to feed into. Renders a skill's active template against caller-supplied input, automatically weaves in the caller's own effective governance (policies applied as content changes, objectives exposed as referenceable template context), resolves nested same-mechanism skill-inclusion references up to a fixed depth with graceful (non-throwing) degradation past that limit or on a missing reference, and must render templates in a sandbox that can't execute arbitrary code and errors on an undefined variable rather than silently rendering it blank. Must be a faithful behavioral port, proven via a characterization test suite against the legacy implementation, and must call Governance only through its exposed policy/objective resolution operations, never its storage directly. Governance resolution during expansion must follow PDR-016: scoped to the acting user's own team only, never a project, never the expanded skill's owning team."

## Clarifications

### Session 2026-07-29

- Q: What should govern an expansion when no acting user is explicitly given, now that PDR-016 makes the legacy fallback (the skill's own owner) structurally impossible when the owner is a team? → A: No fallback — an expansion with no acting user is fully ungoverned (zero policies, zero objectives resolved), never borrowing another identity's context.
- Q: Should the expansion result include resolved objective titles as a structured field, matching legacy's response shape, even though the already-shipped `ExpansionResult` contract (PDR-016) doesn't have one? → A: Yes — add `objectives: string[]` to `ExpansionResult`, updating `bcs/prompt-registry/CONTRACT.md` as part of this feature.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Expand a skill into rendered message content (Priority: P1)

A caller requests a skill by name with some input, and gets back the rendered system/user message content ready to send to a model — the basic operation with no governance context involved yet.

**Why this priority**: This is the foundation every other scenario builds on — without a working render, there's nothing to weave governance into or attach inclusions to.

**Independent Test**: Publish a skill with a simple template, request its expansion with matching input, confirm the rendered output substitutes the input correctly.

**Acceptance Scenarios**:

1. **Given** a skill with a published active version containing both a system and a user template, **When** it's expanded with input matching the template's variables, **Then** both messages render with the input correctly substituted.
2. **Given** a skill whose active version has no system template, **When** it's expanded, **Then** the result's system message is absent and only the user message is returned.
3. **Given** a skill with no published version yet, **When** it's expanded, **Then** the request is rejected the same way requesting a nonexistent skill would be.
4. **Given** a deprecated skill, **When** it's expanded — even by explicitly requesting a specific still-existing version — **Then** the request is rejected the same way requesting a nonexistent skill would be; deprecation blocks expansion entirely, not just default/latest-version lookups.
5. **Given** a template that references a variable the caller never supplied, **When** it's expanded, **Then** the request fails visibly with an error — it never silently renders as blank or missing.
6. **Given** a template containing content designed to execute arbitrary code rather than just substitute a variable, **When** it's expanded, **Then** that code never executes — the render either fails or treats the content as inert text, never as instructions.

---

### User Story 2 - Caller's governance policies are automatically applied (Priority: P1)

When the caller is a known, identified user, their own effective policies (inherited from their team chain, plus any local to their own team) are automatically woven into the expansion — added before the system message, added after the user message, or made available to the template as referenceable content — without the caller doing anything beyond identifying themselves.

**Why this priority**: This is the product's actual differentiator — the thing that makes this "governed expansion" rather than a plain template render. Equal priority to User Story 1 because an ungoverned expansion undersells the whole point of the product.

**Independent Test**: Give a user one team-level policy of each kind (prepend, append, inject), expand a skill as that user, confirm all three effects show up correctly in the output, and confirm the result reports exactly those policy names as applied.

**Acceptance Scenarios**:

1. **Given** a user with an inherited prepend-type policy, **When** they expand a skill with a system template, **Then** the policy's content appears before the skill's own system template content in the rendered system message.
2. **Given** a user with a local append-type policy, **When** they expand a skill, **Then** the policy's content appears after the skill's own user template content in the rendered user message.
3. **Given** a user with an inject-type policy, **When** they expand a skill whose template references that injected content, **Then** the content appears wherever the template placed it — it is never automatically added to the output if the template doesn't reference it.
4. **Given** an expansion that applied two policies, **When** the result is returned, **Then** it reports both policy names, so the caller has visibility into what was applied without inspecting the rendered text themselves.
5. **Given** a user with zero effective policies, **When** they expand a skill, **Then** the output is identical to an ungoverned expansion, and the reported applied-policy list is empty.
6. **Given** a skill owned by (or shared to) a different team than the invoking user's own team, **When** that user expands it, **Then** the policies applied come from **the invoking user's own team chain** — never from the skill's owning team, and never from any project context.
7. **Given** no acting user is provided at all, **When** a skill is expanded, **Then** the result is fully ungoverned — no policies applied, no objectives resolved — regardless of who owns the skill or what team it belongs to.
8. **Given** a caller supplies an optional project context along with their own identity, **When** they expand a skill, **Then** their resolved objectives include any objective scoped to that project, in addition to their own team-chain objectives — but the policies applied are completely unaffected by that project context (policies are never project-scoped, per PDR-016).

---

### User Story 3 - Nested skill inclusion (Priority: P2)

A skill's own template can pull another skill's rendered content into itself by name, and that included skill's template can do the same again, up to a fixed depth — enabling a library of small, composable skills rather than one giant template per use case.

**Why this priority**: Real value beyond a single flat template, but the system remains fully useful without it (User Stories 1–2 alone deliver a working, governed expansion engine).

**Independent Test**: Publish skill A whose template references skill B by name; expand A; confirm B's own rendered content appears in A's output at the point of reference.

**Acceptance Scenarios**:

1. **Given** skill A's template references skill B by name, **When** A is expanded, **Then** B's own current active-version content is rendered and inserted at that point in A's output.
2. **Given** a chain of skills each referencing the next, nested exactly up to the fixed depth limit, **When** the top-level skill is expanded, **Then** every level in the chain resolves successfully.
3. **Given** the same chain with one additional level beyond the fixed depth limit, **When** the top-level skill is expanded, **Then** expansion still completes — the over-limit reference resolves to a plainly visible placeholder in the output instead of the skill's actual content, rather than the whole expansion failing.
4. **Given** a template that references a skill name that doesn't exist, **When** it's expanded, **Then** expansion still completes — that reference resolves to a plainly visible placeholder noting the skill wasn't found, rather than the whole expansion failing.
5. **Given** two skills that reference each other (A includes B, B includes A), **When** either is expanded, **Then** the depth limit still bounds it — it completes in bounded time rather than looping forever.

### Edge Cases

- What happens when a caller expands a skill they don't otherwise have access to (ownership/subscription)? Out of scope for this feature — the accessible-skills access check is a separate, already-built concern (`020-prompt-sharing`); this feature assumes that check has already passed by the time it runs.
- What happens when the same skill is referenced by name more than once within one expansion (not a cycle, just repeated)? Each reference resolves independently to the same current content — no special-cased deduplication or caching behavior is required beyond what naturally happens from resolving the same name twice.
- What happens when a caller requests a skill by name that has multiple published versions but doesn't specify one? The currently-active version is used, matching normal (non-expansion) skill read behavior elsewhere in this bounded context.
- What happens when a caller does specify an explicit version rather than the active one? That exact version's content is used for the top-level skill; nested inclusions still resolve to *their own* current active version, not a pinned one (there's no mechanism to pin a nested inclusion's version).

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST render a skill's version content (system and/or user template) against caller-supplied input, producing the final message content.
- **FR-002**: System MUST reject expanding a skill that has no published version yet, or that is deprecated, the same way it would reject a nonexistent skill — deprecation blocks expansion unconditionally, including when a specific still-existing version is explicitly requested.
- **FR-003**: System MUST render templates in a way that can never execute arbitrary code from template content, and MUST error rather than silently produce blank/missing output when a template references an input variable the caller never supplied.
- **FR-004**: System MUST allow a skill's template to reference another skill by name, pulling that other skill's own current active-version rendered content into the output at the point of reference.
- **FR-005**: System MUST bound nested skill-reference depth at a fixed limit; a reference beyond that limit MUST resolve to a plainly visible placeholder in the output, not an error and not an infinite loop.
- **FR-006**: System MUST resolve a reference to a nonexistent skill name the same non-fatal way — a plainly visible placeholder, not an error.
- **FR-007**: When an acting user is given, System MUST resolve that user's own effective policies (per Governance's own inherited/local resolution rules) and automatically apply them: prepend-type content is added before the system template's own content, append-type content is added after the user template's own content, and inject-type content is made available to the template as referenceable context rather than being inserted automatically.
- **FR-008**: System MUST report, as part of the expansion result, exactly which policies were actually applied.
- **FR-009**: When an acting user is given, System MUST resolve that user's own effective objectives and make them available to the template as referenceable context — objectives are never automatically inserted into rendered output the way policies are; a template author chooses whether to reference them at all.
- **FR-015**: System MUST accept an optional project context alongside an acting user, and MUST use it only when resolving that user's effective objectives (objectives kept their project scope under PDR-016) — it MUST NOT be forwarded into policy resolution (Policy has no project scope at all under PDR-016).
- **FR-010**: Governance resolution used during expansion MUST be scoped to the acting user's own team chain only — never by project, and never by the expanded skill's own owning team, per [PDR-016](../../docs/pdr/016-skill-ownership-sharing-and-project-assignment.md). This applies even when the skill being expanded is owned by, or was subscribed/forked from, a different team than the invoking user's own.
- **FR-011**: System MUST NOT reach into Governance's own storage directly for any part of this feature — it consumes Governance exclusively through its exposed policy/objective resolution operations.
- **FR-012**: System MUST NOT validate a skill's declared input schema against caller-supplied input as part of expansion (matches current behavior; schema validation, if ever added, is a separate concern from this feature).
- **FR-013**: When no acting user is given, System MUST treat the expansion as fully ungoverned — zero policies and zero objectives resolved — rather than falling back to any other identity (e.g. the expanded skill's own owner). This holds regardless of the skill's owner type.
- **FR-014**: System MUST report, as part of the expansion result, the resolved objective titles — matching FR-008's transparency guarantee for policies, and matching the legacy system's own response shape.

### Key Entities

- **Expansion Result**: Not a stored entity — the read-only output of one expansion call: rendered system message (if any), rendered user message, the list of policy names actually applied, and the list of resolved objective titles. Computed fresh on every call from the skill's current version, the acting user's current effective governance, and any nested skills' own current versions — never cached or reused across calls.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: 100% of expansions for a caller with zero effective policies produce output identical to a plain, ungoverned template substitution.
- **SC-002**: 100% of expansions for a caller with active policies show every applicable prepend/append/inject effect reflected correctly in the output, with none silently dropped, and the reported applied-policy list exactly matches what was actually applied.
- **SC-003**: 100% of nested skill-reference chains that exceed the fixed depth limit complete successfully with a visible placeholder at the over-limit point, rather than erroring or hanging — verified with chains at least three times deeper than the limit.
- **SC-004**: 100% of skill-reference cycles resolve in bounded time rather than looping indefinitely.
- **SC-005**: 100% of templates attempting arbitrary code execution, or referencing an unsupplied variable, fail visibly rather than silently rendering incorrect or blank output.
- **SC-006**: 100% of deprecated skills are rejected from expansion, indistinguishable from a nonexistent skill from the caller's point of view.
- **SC-007**: A representative fixture suite (covering real skill/policy/objective/inclusion combinations) run through both the legacy implementation and this feature's implementation produces identical output for every fixture.
- **SC-008**: 100% of expansions with no acting user given resolve as fully ungoverned (empty policies and empty objectives), regardless of the expanded skill's owner type.

## Assumptions

- "Caller" means an authenticated actor already resolved to an organization and (optionally) user identity, consistent with every other feature in this bounded context; authentication and identity resolution are out of scope here.
- The `validate` policy enforcement type currently has **no actual effect on expansion output** in the legacy system, despite an inline comment there claiming it's "handled post-render" — no such handling exists anywhere in the legacy codebase. This port faithfully preserves that: a `validate`-type policy is resolved and counted like any other, but does not alter rendered output. This is a known, pre-existing gap carried forward deliberately for characterization fidelity, not something this feature is expected to fix — giving `validate` real teeth is a distinct future feature.
- The fixed nested-inclusion depth limit matches the legacy system's own hardcoded value (3 levels of nesting beyond the top-level skill) — carried forward as-is, not re-derived or made configurable by this feature.
- Access control (whether the caller may expand this particular skill at all) is fully out of scope — this feature assumes that check already happened upstream, per `020-prompt-sharing`'s accessible-skills query.

