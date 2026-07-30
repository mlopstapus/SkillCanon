---
epic: 000-foundations
feature: 012-fix-legacy-backend-import-path-mismatch
status: open
dependencies: []
---

# Fix Legacy Backend Import Path Mismatch (`spechub_server` vs. `skillcanon_server`)

Discovered 2026-07-29 while building `021-expansion-engine`'s characterization test suite (which needs to import and call the legacy `expand_prompt` directly). The repo-wide SpecHub→SkillCanon rename rewrote many of `legacy/backend/src/spechub_server/`'s own internal imports to `from src.skillcanon_server import ...`, but the directory itself was never `git mv`'d — it's still physically `legacy/backend/src/spechub_server/`. Any code path that exercises one of those rewritten imports fails with `ModuleNotFoundError: No module named 'src.skillcanon_server'`.

## Requirements

- [ ] `git mv legacy/backend/src/spechub_server legacy/backend/src/skillcanon_server` (or the inverse — revert the internal import rewrites back to `spechub_server` — whichever direction matches the rest of this repo's post-rename conventions; the directory itself is the one that's actually out of sync, so renaming it is almost certainly correct, not the imports)
- [ ] Update any config referencing the old path (`pyproject.toml`, `uv.lock`, import roots in test config, etc.)
- [ ] Confirm the full legacy test suite (`cd legacy/backend && uv run pytest tests/ -v`) still passes after the rename

## Acceptance Criteria

- [ ] `python -c "from src.skillcanon_server.services import prompt_service"` succeeds with no path shim
- [ ] No remaining reference to the mismatched name in either direction (directory name matches every internal import consistently)

## Open Questions

- None currently.

## Dependencies

- None — a repo-hygiene fix to existing legacy code, independent of any active epic.

## Technical Notes

Worked around (not fixed) in `021-expansion-engine`'s `legacy/backend/scratch/expand_characterization_harness.py`: the harness installs a `sys.modules["src.skillcanon_server"]` alias pointing at the real, physically-`spechub_server` package before importing anything from it, rather than editing any legacy source file (out of scope for that feature, and a same-turn attempt to `git mv` the directory was blocked by this environment's safety classifier as a bulk/invasive change). That shim is a targeted, test-local workaround — it does not fix the underlying mismatch for any other caller (e.g. actually running the legacy server, or any other future characterization/comparison work against this codebase).
