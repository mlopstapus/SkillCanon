# Plan
- identity-access: `application/is-instance-set-up.ts` + barrel export.
- `src/app/(auth)/register/`: `register-instance.ts` (guard + `registerFirstRunAdmin`), `actions.ts` uses it, `page.tsx` renders `InviteOnlyNotice` when set up, `register-form.tsx` (notice, "Tribe" default).
- Tests: Testcontainers test (first run creates, second refused, count unchanged, with `STRIPE_ENABLED=true`); form markup tests; e2e: visitor sees the notice after setup.
