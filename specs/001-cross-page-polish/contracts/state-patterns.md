# Shared State Pattern Contract

## Component Contract

`AppState` renders a canonical product state block.

Required props:
- `variant`: `empty`, `loading`, or `error`
- `title`: concise heading
- `description`: concrete user situation or recovery guidance

Optional props:
- `action`: React node rendered after the description
- `className`: layout override for page-specific spacing only

Behavior:
- `variant="error"` renders with `role="alert"`.
- `variant="empty"` and `variant="loading"` render with `role="status"`.
- All variants use `aria-live="polite"`.
- Loading variant includes a token-styled spinner with `aria-hidden="true"`.
- The action is placed after the description and is not duplicated elsewhere in the state block.

## Adoption Contract

In-scope pages with empty, loading, or recoverable error states should import `AppState` from `@/shared/ui` and pass domain-specific copy/action. Page-specific exceptions are allowed only for copy/action semantics; layout, emphasis, and accessibility behavior should remain shared.

## Verification Contract

Vitest render tests and static accessibility audits must cover:
- Role and live-region behavior for all variants.
- Loading spinner is decorative.
- Representative route empty states render through the shared state pattern.

The static audit helper must fail on `critical` or `serious` axe violations for representative route states.
