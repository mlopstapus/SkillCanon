# Feature Specification: Fix Legacy Backend Import Path Mismatch

**Feature Branch**: `012-fix-legacy-backend-import-path-mismatch`

**Created**: 2026-08-03

**Status**: Clarified

**Input**: User description: "Fix legacy backend import path mismatch by renaming the old spechub_server package directory to skillcanon_server and updating stale path references so canonical imports and legacy tests work without a shim."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Import the legacy backend through the canonical package name (Priority: P1)

A developer or automated check imports legacy backend modules through the canonical SkillCanon package name and the import succeeds without any local alias shim.

**Why this priority**: The mismatch currently breaks any path that reaches rewritten imports and blocks reliable characterization or regression testing of the legacy backend.

**Independent Test**: From the legacy backend environment, import `src.skillcanon_server.services.prompt_service` directly without preloading a `sys.modules` alias or adding a compatibility package.

**Acceptance Scenarios**:

1. **Given** the repository is checked out with the legacy backend available, **When** a process imports `src.skillcanon_server.services.prompt_service`, **Then** the import succeeds without a shim, compatibility alias, or manual path override.
2. **Given** any legacy backend module imports another module from the same backend package, **When** that import path is evaluated, **Then** it uses the canonical `src.skillcanon_server` namespace and resolves successfully.
3. **Given** a characterization or unit test previously needed a local alias for `src.skillcanon_server`, **When** the test runs after this feature, **Then** the alias can be removed with no import failure.

---

### User Story 2 - Keep configuration and test discovery aligned with the canonical package path (Priority: P2)

A maintainer runs existing backend tooling and tests, and the tooling discovers the legacy backend through the canonical package path instead of the old SpecHub path.

**Why this priority**: Renaming only imports is not enough if test configuration, packaging metadata, lockfiles, or import roots still point at the old directory name.

**Independent Test**: Run the full legacy backend test suite from its normal project root and confirm test discovery, import resolution, and package metadata all succeed without stale-path workarounds.

**Acceptance Scenarios**:

1. **Given** configuration files reference backend package roots, **When** they are reviewed after the rename, **Then** each relevant reference points to the canonical `skillcanon_server` path.
2. **Given** the full legacy backend test suite is run, **When** tests discover and import backend modules, **Then** no test fails because of `spechub_server`/`skillcanon_server` path mismatch.
3. **Given** dependency metadata or lockfile content names the backend package path, **When** it is checked after the change, **Then** it is consistent with the canonical path or absent because it is no longer needed.

### Edge Cases

- Existing documentation or comments that mention historical SpecHub branding may remain only when they describe product history and are not import paths, package roots, module names, or executable configuration.
- References inside generated caches, virtual environments, build output, or ignored local artifacts are out of scope and should not block acceptance.
- The feature must not preserve both package directories as parallel source trees; a compatibility duplicate would leave the mismatch unresolved.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The legacy backend source package MUST have one canonical importable package root named `skillcanon_server`.
- **FR-002**: The old `spechub_server` source package root MUST NOT remain as the active package directory after the feature is complete.
- **FR-003**: Internal legacy backend imports MUST consistently use `src.skillcanon_server` for cross-module references.
- **FR-004**: Backend project configuration, test configuration, package metadata, and lockfile entries MUST NOT reference the old package root when those references affect imports, packaging, discovery, or execution.
- **FR-005**: The direct import smoke check `from src.skillcanon_server.services import prompt_service` MUST succeed in the legacy backend environment without a shim.
- **FR-006**: The full legacy backend test suite MUST pass from its standard project root after stale path references are removed.
- **FR-007**: The implementation MUST remove any characterization-only alias shim that existed solely to bridge `src.skillcanon_server` to `src.spechub_server`.
- **FR-008**: Remaining occurrences of `spechub_server` MUST be limited to non-executable historical context, if any; no active code, test, config, or package metadata may depend on that name.

### Key Entities

- **Canonical Legacy Backend Package**: The importable backend source package exposed as `src.skillcanon_server`, containing the existing legacy backend services, models, repositories, routes, and tests' target modules.
- **Deprecated Package Name**: The former `spechub_server` package root, which is no longer valid for active imports, execution configuration, or test scaffolding after this feature.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: The direct import smoke check `python -c "from src.skillcanon_server.services import prompt_service"` succeeds from the legacy backend environment without any path shim.
- **SC-002**: The full legacy backend test suite completes successfully with zero failures caused by module import or package discovery errors.
- **SC-003**: A repository search of active source, test, and configuration files finds zero executable references to `spechub_server` after excluding historical prose and ignored/generated artifacts.
- **SC-004**: A repository search confirms the canonical package path appears anywhere the legacy backend package root must be referenced for imports, configuration, or tests.

## Assumptions

- The repo-wide rename already established SkillCanon as the canonical product and package terminology; this feature only finishes the legacy backend package-path alignment.
- The correct outcome is a real source package rename, not a long-term alias or compatibility shim.
- Existing backend behavior is preserved; this feature changes package identity and stale references only.
- The legacy backend test command remains `cd legacy/backend && uv run pytest tests/ -v` unless repository tooling has a newer equivalent documented in the checked-out code.
