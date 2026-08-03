# Implementation Plan: Fix Legacy Backend Import Path Mismatch

**Branch**: `012-fix-legacy-backend-import-path-mismatch` | **Date**: 2026-08-03 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/012-fix-legacy-backend-import-path-mismatch/spec.md`

## Summary

Rename the legacy backend package directory from `legacy/backend/src/spechub_server` to `legacy/backend/src/skillcanon_server` so the already-canonical imports, packaging metadata, start script, Alembic config, and tests all resolve the same package root. Remove the temporary characterization harness alias shim that mapped `src.skillcanon_server` to `src.spechub_server`, then validate with the direct import smoke check and the full legacy backend pytest suite.

## Technical Context

**Language/Version**: Python 3.12 for `legacy/backend` per `requires-python = ">=3.12"`

**Primary Dependencies**: FastAPI, SQLAlchemy async, Alembic, Pydantic, MCP, Jinja2, pytest, pytest-asyncio

**Storage**: PostgreSQL in deployed/dev backend paths; SQLite-backed async sessions in legacy tests and characterization harness

**Testing**: `cd legacy/backend && uv run pytest tests/ -v`; smoke import with `uv run python -c "from src.skillcanon_server.services import prompt_service"`

**Target Platform**: Legacy Python backend service executed from `legacy/backend`

**Project Type**: Monorepo with a legacy Python backend package under `legacy/backend/src`

**Performance Goals**: No runtime behavior change; import and test discovery should remain normal Python package resolution

**Constraints**: Do not preserve parallel `spechub_server` and `skillcanon_server` source trees; do not add a compatibility alias as the fix; keep remaining old-name mentions limited to historical prose outside active execution paths

**Scale/Scope**: One package directory rename plus stale executable reference cleanup in legacy backend code, tests, scratch harness, and package/config metadata

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- **P1 Test-First Development**: PASS. This is a package identity repair with explicit pre-existing acceptance checks. The direct import smoke check currently fails before the rename and will pass after; the full legacy pytest suite is the regression guard.
- **D1/D2 Domain boundaries and invariants**: PASS. No domain behavior, service contracts, or invariants are changed.
- **M1-M3 Multi-tenant isolation**: PASS. No tenant-scoped tables or service-layer authorization behavior are added or modified.
- **S1-S3 Secure by default**: PASS. No secret handling, template rendering policy, or logging behavior is changed.
- **C1-C2 Audit/compliance**: PASS. No mutations, cross-tenant-sensitive reads, transport behavior, or production config defaults are added.
- **G1 Feature-gated by entitlement**: PASS. No new REST route, MCP tool, or UI feature is added.

## Project Structure

### Documentation (this feature)

```text
specs/012-fix-legacy-backend-import-path-mismatch/
|-- plan.md
|-- research.md
|-- data-model.md
|-- quickstart.md
|-- checklists/
|   `-- requirements.md
`-- tasks.md
```

### Source Code (repository root)

```text
legacy/backend/
|-- pyproject.toml
|-- uv.lock
|-- alembic/
|   `-- env.py
|-- scripts/
|   `-- start.sh
|-- scratch/
|   `-- expand_characterization_harness.py
|-- src/
|   `-- skillcanon_server/
|       |-- auth.py
|       |-- config.py
|       |-- database.py
|       |-- main.py
|       |-- models.py
|       |-- schemas.py
|       |-- mcp/
|       |-- routers/
|       `-- services/
`-- tests/
    |-- conftest.py
    `-- test_*.py
```

**Structure Decision**: Keep the legacy backend as the existing Python package project under `legacy/backend`, but rename its active source package directory to the canonical `skillcanon_server` path already referenced by config, scripts, tests, and internal imports.

## Complexity Tracking

No constitution violations or additional complexity exceptions are required.
