# Quickstart: Hierarchical Resolution Engine

## Verify Artifacts

```sh
.specify/scripts/bash/check-prerequisites.sh --json --require-tasks --include-tasks
```

## Run Focused Tests

```sh
pnpm test -- src/bcs/governance/application/resolve-effective-policies.test.ts src/bcs/governance/application/resolve-effective-objectives.test.ts src/bcs/governance/application/count-local-policies-and-objectives.test.ts
```

## Run Project Checks

```sh
pnpm test
pnpm typecheck
pnpm lint
```

## Manual Review Checklist

- Confirm policy fixtures cover ancestor, own-team, project, inactive, equal-priority inherited/local tie, unknown user, and cross-organization rows.
- Confirm objective fixtures cover ancestor, own-team, user-personal, project, inactive, parent-objective metadata, unknown user, and cross-organization rows.
- Confirm no resolver implementation stores module-level cache state or memoized results.
- Confirm `src/bcs/governance/index.ts` exports the new services and effective result types.
