# Quickstart: Skill Expansion Engine

Validation guide, not implementation — proves the feature end-to-end once built. Full behavior in `data-model.md`/`spec.md`.

## Prerequisites

- `pnpm install` (after this feature adds `nunjucks` to `package.json`)
- Testcontainers spins up Postgres automatically for the test suite

## Scenario 1 — Plain expansion, no governance

```ts
import { createPrompt, publishVersion, expand } from "@/bcs/prompt-registry";

const skill = await createPrompt(db, actor, { organizationId, name: "greet" });
await publishVersion(db, actor, {
  promptName: "greet", organizationId, version: "v1",
  userTemplate: "Hello, {{ name }}!",
});

const result = await expand(db, { organizationId, promptName: "greet", input: { name: "Ben" } });
// result.userMessage === "Hello, Ben!"
// result.appliedPolicies === [], result.objectives === []
```

## Scenario 2 — Governance woven in automatically

```ts
// user has an inherited prepend policy "Always be concise." and a local
// append policy "End with a summary."
const result = await expand(db, {
  organizationId, promptName: "greet", input: { name: "Ben" }, userId: user.id,
});
// result.systemMessage starts with "Always be concise."
// result.userMessage ends with "End with a summary."
// result.appliedPolicies includes both policy names
```

## Scenario 3 — Nested inclusion, depth limit, missing reference

```ts
await publishVersion(db, actor, {
  promptName: "outer", organizationId, version: "v1",
  userTemplate: "Context: {{ include_prompt('greet') }}",
});

const result = await expand(db, { organizationId, promptName: "outer", input: { name: "Ben" } });
// result.userMessage === "Context: Hello, Ben!"

// A reference to a name that doesn't exist:
// userTemplate: "{{ include_prompt('does-not-exist') }}"
// → userMessage contains a visible "not found" placeholder, expansion still succeeds

// A chain nested one level past the depth limit:
// → the over-limit reference renders as a visible "max depth exceeded" placeholder,
//   expansion still succeeds
```

## Scenario 4 — Template safety

```ts
// A template referencing an undefined variable throws rather than rendering blank:
await expect(expand(db, { organizationId, promptName: "greet", input: {} }))
  .rejects.toThrow();
```

## Running the characterization suite

```bash
pnpm vitest run src/bcs/prompt-registry/application/expand-characterization.test.ts
```

Expect every fixture (real skill/policy/objective/inclusion combinations) to produce output identical to the legacy Python `expand_prompt`, run via a small one-off harness against the same fixture data.

## Running the full suite

```bash
pnpm vitest run src/bcs/prompt-registry
```
