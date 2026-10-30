---
epic: 015-distribution-correctness
feature: 010-literal-braces-in-skill-bodies
status: open
dependencies: []
---

# Literal Braces in Skill Bodies

Found 2026-10-30 while seeding a local instance with the 46 Official and Promoted skills from Tribe Bazaar. Every `SKILL.md` is rendered as a Nunjucks template at expansion time (`src/bcs/prompt-registry/infrastructure/template-renderer.ts`, `throwOnUndefined: true`), so a skill body with literal braces fails with a 500 on `expand`, and the error is logged as "unhandled error in REST route". Three of the 46 failed:

- `secure-railway-setup`: Railway's `${{Postgres.DATABASE_URL}}` → "attempted to output null or undefined value"
- `linear-external-workspace-api`: a Python f-string, `f'{{ document(id: "{DOC_ID}") {{ content }} }}'` → "parseSignature: expected comma"
- `herdr-dispatch-rustyg`: a `{{{brief}}}` placeholder meant for a human → "parseAggregate: expected colon"

None of these authors knew about SkillCanon. Any skill written elsewhere can hit this, which makes it a blocker for importing from Bazaar or GitHub generally. The author-facing symptom today is a generic 500 with no hint that templating is the cause.

## Requirements

- [ ] A version records whether its body is a template. Default for versions created through import (folder, GitHub, REST with no flag) is **raw**: served byte for byte, no Nunjucks. A skill authored in SkillCanon that uses `{{ include_prompt }}` or variables opts in.
- [ ] Expansion of a raw version never calls the renderer. Policies and objectives still apply; they wrap the body, they don't render it.
- [ ] A template version that fails to render returns a 422 naming the line and column and the Nunjucks message, not a 500. The same message shows in the UI's Preview tab.
- [ ] Publishing a template version validates the render at publish time with empty variables, so the author sees the error before anyone calls `expand`.
- [ ] Existing versions: a migration marks every current version as a template (that's what they are today), so nothing changes for them. The three skills above are republished raw on the seeded instance by hand; no data fix.

## Acceptance Criteria

- [ ] On a fresh instance, importing the three skills named above and calling `expand` on each returns 200 with the body unchanged, braces included.
- [ ] Publishing a template version whose body is `{{ oops` returns 422 with a line number, and the Preview tab shows the same.
- [ ] `e2e/ui-walk.e2e.test.ts` gains a skill whose body contains `${{X}}`, created through the UI as raw, and asserts the REST expand round-trips it.
- [ ] The existing include and policy tests stay green.

## Technical Notes

- `template-renderer.ts` is the only render call site. The flag belongs on `prompt_versions` (one nullable boolean, migrate existing rows to `true`). One migration, coordinate with any other lane adding one.
- The CLI sync path (015/001, 015/002) renders includes before writing the stub; a raw version skips that step and writes the body as is.
- Alternative considered: escape braces on import with `{% raw %}`. Rejected, because it rewrites the author's file and the stub would carry the markers.
