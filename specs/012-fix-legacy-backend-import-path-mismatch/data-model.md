# Data Model: Fix Legacy Backend Import Path Mismatch

This feature introduces no new database entities, domain models, fields, relationships, validation rules, or state transitions.

The only named implementation concepts are package-path identities:

## Canonical Legacy Backend Package

- **Name**: `src.skillcanon_server`
- **Location**: `legacy/backend/src/skillcanon_server`
- **Contains**: Existing legacy backend modules, including `auth.py`, `config.py`, `database.py`, `main.py`, `models.py`, `schemas.py`, `mcp/`, `routers/`, and `services/`
- **Validation rule**: Active code, tests, package metadata, and execution config must resolve this package without a shim.

## Deprecated Package Name

- **Name**: `src.spechub_server`
- **Previous location**: `legacy/backend/src/spechub_server`
- **Validation rule**: Must not remain as an active package directory or executable import/config reference after implementation. Historical prose may mention it only as context.
