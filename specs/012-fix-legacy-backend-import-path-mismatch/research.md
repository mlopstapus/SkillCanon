# Research: Fix Legacy Backend Import Path Mismatch

## Decision: Rename the physical package directory

**Decision**: Use `git mv legacy/backend/src/spechub_server legacy/backend/src/skillcanon_server`.

**Rationale**: Active imports, the start script, Alembic env, tests, and `pyproject.toml` already use `src.skillcanon_server` or `src/skillcanon_server`. The only component out of alignment is the physical directory name, so renaming the directory fixes Python package discovery without creating duplicate source trees or long-term aliasing.

**Alternatives considered**:

- Add a compatibility package named `skillcanon_server` that imports from `spechub_server`: rejected because the spec forbids parallel source roots and compatibility aliases.
- Rewrite active imports back to `src.spechub_server`: rejected because SkillCanon is the canonical product/package terminology and `pyproject.toml` already packages `src/skillcanon_server`.

## Decision: Remove the scratch harness alias shim

**Decision**: Update `legacy/backend/scratch/expand_characterization_harness.py` to import `src.skillcanon_server` directly and remove the `sys.modules` alias bootstrap.

**Rationale**: The alias exists solely to bridge the old physical path to canonical imports. After the directory rename, keeping it would conceal future package-path regressions and violate the acceptance criterion that imports work without a shim.

**Alternatives considered**:

- Leave the alias as a harmless fallback: rejected because it would preserve the workaround the feature is intended to remove.

## Decision: Validate active references with targeted repository searches

**Decision**: After implementation, search active source, test, and config paths for `spechub_server`, excluding generated/ignored artifacts and historical prose only when clearly non-executable.

**Rationale**: The bug is caused by path/name drift, so search validation is a direct acceptance check alongside pytest.

**Alternatives considered**:

- Rely only on pytest: rejected because dead or rarely exercised config paths could still retain the stale package name.
