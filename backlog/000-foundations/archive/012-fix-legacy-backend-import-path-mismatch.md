---
epic: 000-foundations
feature: 012-fix-legacy-backend-import-path-mismatch
status: done
dependencies: []
---

# Fix Legacy Backend Import Path Mismatch (`spechub_server` vs. `skillcanon_server`)

Discovered 2026-07-29 while building `021-expansion-engine`'s characterization test suite (which needs to import and call the legacy `expand_prompt` directly). The repo-wide SpecHub→SkillCanon rename rewrote many of `legacy/backend/src/spechub_server/`'s own internal imports to `from src.skillcanon_server import ...`, but the directory itself was never `git mv`'d — it's still physically `legacy/backend/src/spechub_server/`. Any code path that exercises one of those rewritten imports fails with `ModuleNotFoundError: No module named 'src.skillcanon_server'`.

## Requirements

- [x] `git mv legacy/backend/src/spechub_server legacy/backend/src/skillcanon_server` (or the inverse — revert the internal import rewrites back to `spechub_server` — whichever direction matches the rest of this repo's post-rename conventions; the directory itself is the one that's actually out of sync, so renaming it is almost certainly correct, not the imports) — done via a separate commit `e08f897` ("fix(legacy-backend): align canonical package path", 2026-08-02, SKI-70) that landed before this cleanup pass; `pyproject.toml`'s `packages = ["src/skillcanon_server"]` already matches. This item was never archived after that commit shipped.
- [x] Update any config referencing the old path (`pyproject.toml`, `uv.lock`, import roots in test config, etc.) — confirmed via `e08f897`
- [x] Confirm the full legacy test suite (`cd legacy/backend && uv run pytest tests/ -v`) still passes after the rename — 176 passed

## Acceptance Criteria

- [x] `python -c "from src.skillcanon_server.services import prompt_service"` succeeds with no path shim — verified via `uv run python -c "from src.skillcanon_server.services import prompt_service"`
- [x] No remaining reference to the mismatched name in either direction (directory name matches every internal import consistently) — a stray untracked `legacy/backend/src/spechub_server/__pycache__/` directory (gitignored build cache, no tracked `.py` files) was found and removed during this pass

## Open Questions

- None currently.

## Dependencies

- None — a repo-hygiene fix to existing legacy code, independent of any active epic.

## Technical Notes

Worked around (not fixed) in `021-expansion-engine`'s `legacy/backend/scratch/expand_characterization_harness.py`: the harness installs a `sys.modules["src.skillcanon_server"]` alias pointing at the real, physically-`spechub_server` package before importing anything from it, rather than editing any legacy source file (out of scope for that feature, and a same-turn attempt to `git mv` the directory was blocked by this environment's safety classifier as a bulk/invasive change). That shim is a targeted, test-local workaround — it does not fix the underlying mismatch for any other caller (e.g. actually running the legacy server, or any other future characterization/comparison work against this codebase).
