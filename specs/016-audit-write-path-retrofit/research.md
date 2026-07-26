# Research: Audit Write Path Retrofit

## Decision: model `transport` as a Drizzle text enum and TypeScript union

Rationale: The feature needs runtime database enforcement and compile-time call-site pressure. A Drizzle `text("transport", { enum: [...] }).notNull()` column plus `AuditTransport` union makes missing or misspelled transport values fail before or during insert.

Alternatives considered: A plain `text` column with validation only in `record()` was weaker at the storage boundary. A PostgreSQL enum would add migration complexity without a current cross-table reuse need.

## Decision: keep `source_ip` nullable text

Rationale: Source IP can be IPv4, IPv6, proxy-derived, or absent. Storing a nullable text value preserves caller-provided request context without introducing Postgres `inet` parsing concerns in tests and app code.

Alternatives considered: PostgreSQL `inet` provides stronger validation, but existing request-boundary IP extraction is not yet centralized and this feature is storage/write-path focused.

## Decision: existing application-service signatures get optional audit context

Rationale: Current call sites are mostly server-side application services without distribution-layer request objects. Adding an optional `{ transport, sourceIp }` context, defaulting to `web` where the existing code is web/session-originated, lets existing tests and callers continue while still giving API/CLI/system callers an explicit way to pass a real value.

Alternatives considered: Forcing every current caller to pass context immediately would create broad route/UI churn outside the bounded context. A database default was rejected because FR-007 forbids placeholders and unset values.

## Decision: retrofit Identity & Access mutations with `withAudit()`

Rationale: `withAudit()` is the existing kernel primitive designed to guarantee mutation and audit insert atomicity. New tests should assert both success and forced-failure rollback where practical.

Alternatives considered: Calling `record()` after service completion would not guarantee rollback coupling. Directly inserting audit rows from identity-access would violate the Audit & Compliance ownership boundary.

## Decision: document verbs in `src/bcs/audit-compliance/CONTRACT.md`

Rationale: The contract is already the public bounded-context reference for `record()`. Adding a canonical verb/color table there keeps future mutation authors and the audit UI aligned from one source.

Alternatives considered: A new docs page would be discoverable only if cross-linked. A code-only constant would help implementation but not satisfy the documentation acceptance criterion by itself.
