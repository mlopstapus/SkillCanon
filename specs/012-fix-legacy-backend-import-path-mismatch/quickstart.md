# Quickstart: Fix Legacy Backend Import Path Mismatch

Run these checks from the repository root after implementation.

## 1. Confirm canonical import works

```bash
cd legacy/backend
uv run python -c "from src.skillcanon_server.services import prompt_service"
```

Expected result: command exits 0 without any `sys.modules` alias, compatibility package, or manual path override.

## 2. Run the full legacy backend test suite

```bash
cd legacy/backend
uv run pytest tests/ -v
```

Expected result: tests pass without import or package discovery errors related to `spechub_server` or `skillcanon_server`.

## 3. Check for stale executable references

```bash
rg -n "spechub_server" legacy/backend/src legacy/backend/tests legacy/backend/pyproject.toml legacy/backend/uv.lock legacy/backend/alembic legacy/backend/scripts legacy/backend/scratch
```

Expected result: no active executable references remain. Historical prose is acceptable only when it is clearly non-executable context.
