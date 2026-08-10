---
type: foundations
item: 004-api-and-error-conventions
status: done
deliverable: context/api-conventions.md
---

# API & Error Conventions

Distribution is the only bounded context that talks to the outside world, over two transports (REST and MCP) that must behave consistently — the same underlying error (e.g. "policy not found," "expired API key," "entitlement limit reached") needs a predictable shape on both, since tenet C1 also requires every mutation to be audited "on every transport," and inconsistent error handling is exactly where one transport quietly skips a check the other has.

## What We Need to Decide / Research

- REST error response shape: status code conventions, error body schema (code, message, field-level details for validation errors).
- API versioning approach, if any — is `/api/v1/` warranted now, or is that premature given there's one consumer (the bundled frontend) at launch?
- How domain errors (thrown by a BC's application service) map to REST status codes and MCP tool error responses consistently — a shared error-mapping layer in Distribution, not ad hoc per route handler.
- Pagination convention for list endpoints (offset/limit vs. cursor) — current Python API uses page/page_size; decide whether to carry that forward.
- Rate limiting approach for the REST API and MCP endpoint, especially once multi-tenant SaaS is live (noisy-neighbor risk).

## Options / Considerations

- A single `DomainError` base class (or discriminated union) that every BC's application service throws, with a Distribution-owned mapper translating it to REST status + MCP tool error text in one place, directly satisfies "the same underlying error behaves consistently across transports" without every route handler reimplementing the mapping.
- Skip versioning at launch (`/api/` not `/api/v1/`) given the only consumer is the bundled frontend — revisit once there's a public API consumed by third parties.

## Deliverable

`context/api-conventions.md` — error shape, status code table, the shared error-mapping approach, pagination convention, and a rate-limiting decision (or explicit "deferred, here's why").

## Dependencies

None, but should land before `008-distribution` epic starts.
