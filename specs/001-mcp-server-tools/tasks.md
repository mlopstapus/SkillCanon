# Tasks: MCP Server & Tools

**Input**: Design documents from `/specs/001-mcp-server-tools/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/mcp-server-tools.contract.md, quickstart.md

**Tests**: Required by spec FR-017 and success criteria SC-001 through SC-008. Write failing tests before implementation in each story phase.

**Organization**: Tasks are grouped by user story so each story can be implemented and tested independently after foundational infrastructure is present.

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Add dependency and file structure needed by all MCP stories.

- [x] T001 Add `@modelcontextprotocol/sdk` dependency to `package.json` and `pnpm-lock.yaml`
- [x] T002 [P] Create MCP Distribution application module placeholders in `src/bcs/distribution/application/mcp-session.ts` and `src/bcs/distribution/application/mcp-tools.ts`
- [x] T003 [P] Create Next MCP route placeholder in `src/app/mcp/route.ts`
- [x] T004 Export MCP application helpers from `src/bcs/distribution/index.ts`

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Core session/auth/transport infrastructure that all stories depend on.

- [x] T005 [P] Add failing session-cache tests for caller caching, context-delivered tracking, cleanup, and restart reset in `src/bcs/distribution/application/mcp-session.test.ts`
- [x] T006 [P] Add failing MCP tool discovery/schema tests for the exact six public tools in `src/bcs/distribution/application/mcp-tool-characterization.test.ts`
- [x] T007 [P] Add failing bearer-auth route tests for valid authDb lookup, invalid-key rejection before tenant reads, entitlement gate, and raw-key log safety in `src/app/mcp/route.test.ts`
- [x] T008 Implement in-memory MCP session manager and bearer caller resolver in `src/bcs/distribution/application/mcp-session.ts`
- [x] T009 Implement shared MCP input parsing, text-content response helper, and static tool metadata in `src/bcs/distribution/application/mcp-tools.ts`
- [x] T010 Implement Streamable HTTP MCP route adapter with bearer-only auth, `authDb`, app `db`, entitlement gate, and safe logging in `src/app/mcp/route.ts`
- [x] T011 Run foundational focused tests for `src/bcs/distribution/application/mcp-session.test.ts`, `src/bcs/distribution/application/mcp-tool-characterization.test.ts`, and `src/app/mcp/route.test.ts`

**Checkpoint**: MCP route can authenticate and discover exactly the compatibility tool set.

---

## Phase 3: User Story 1 - Connect an MCP-capable client (Priority: P1) MVP

**Goal**: A valid bearer-key MCP client connects to `/mcp` and discovers the exact six legacy tools and schemas; invalid credentials are rejected before tenant reads.

**Independent Test**: Route-level MCP initialize/tools-list calls with valid and invalid bearer keys.

- [x] T012 [P] [US1] Add failing route contract tests for MCP initialize/tools-list requests in `src/app/mcp/route.test.ts`
- [x] T013 [US1] Register `sh-list`, `sh-search`, `sh-context`, `sh-run`, `sh-workflow-list`, and `sh-workflow-run` with legacy schemas in `src/bcs/distribution/application/mcp-tools.ts`
- [x] T014 [US1] Wire registered tools into the MCP SDK server instance in `src/app/mcp/route.ts`
- [x] T015 [US1] Verify User Story 1 focused tests in `src/app/mcp/route.test.ts` and `src/bcs/distribution/application/mcp-tool-characterization.test.ts`

---

## Phase 4: User Story 2 - Resolve governed prompt content through MCP (Priority: P1)

**Goal**: `sh-list`, `sh-search`, `sh-context`, and `sh-run` return legacy-compatible text while using current tenant-scoped prompt/governance/expansion services.

**Independent Test**: Seed prompts, policies, and objectives; call the four tools directly and through the route; compare output strings to legacy contract fixtures.

- [x] T016 [P] [US2] Add failing characterization tests for `sh-list` and `sh-search` output in `src/bcs/distribution/application/mcp-tool-characterization.test.ts`
- [x] T017 [P] [US2] Add failing characterization tests for `sh-context` context output, invalid project id, and one-time session context injection in `src/bcs/distribution/application/mcp-tools.test.ts`
- [x] T018 [P] [US2] Add failing characterization tests for `sh-run` JSON/plain input parsing, inaccessible prompt denial, and formatted expansion output in `src/bcs/distribution/application/mcp-tools.test.ts`
- [x] T019 [US2] Implement `sh-list` and `sh-search` by calling `listPrompts` in `src/bcs/distribution/application/mcp-tools.ts`
- [x] T020 [US2] Implement `sh-context` and session context block formatting using Governance exported resolvers in `src/bcs/distribution/application/mcp-tools.ts`
- [x] T021 [US2] Implement `sh-run` prompt accessibility check, expansion call, and legacy text formatting in `src/bcs/distribution/application/mcp-tools.ts`
- [x] T022 [US2] Verify User Story 2 focused tests in `src/bcs/distribution/application/mcp-tools.test.ts` and `src/bcs/distribution/application/mcp-tool-characterization.test.ts`

---

## Phase 5: User Story 3 - Run legacy workflow tools through MCP (Priority: P2)

**Goal**: `sh-workflow-list` and `sh-workflow-run` preserve legacy names and shapes while mapping to skill-chain capabilities.

**Independent Test**: Seed chain-kind skills and call workflow tools with legacy arguments.

- [x] T023 [P] [US3] Add failing workflow-list and workflow-run characterization tests in `src/bcs/distribution/application/mcp-tools.test.ts`
- [x] T024 [US3] Implement accessible chain listing with legacy workflow-list formatting in `src/bcs/distribution/application/mcp-tools.ts`
- [x] T025 [US3] Implement legacy workflow-run argument parsing and skill-chain start/formatting in `src/bcs/distribution/application/mcp-tools.ts`
- [x] T026 [US3] Verify User Story 3 focused tests in `src/bcs/distribution/application/mcp-tools.test.ts`

---

## Phase 6: User Story 4 - Preserve session behavior across ordinary process churn (Priority: P2)

**Goal**: Session identity and context-delivered state cache per process, but cache loss only causes safe revalidation and at most one extra context block.

**Independent Test**: Simulate cache hit and cache reset with a mocked authDb lookup counter.

- [x] T027 [P] [US4] Add failing restart/revalidation tests in `src/bcs/distribution/application/mcp-session.test.ts`
- [x] T028 [US4] Implement cache miss revalidation and explicit session reset helpers in `src/bcs/distribution/application/mcp-session.ts`
- [x] T029 [US4] Verify User Story 4 focused tests in `src/bcs/distribution/application/mcp-session.test.ts`

---

## Phase 7: User Story 5 - Audit usage without leaking secrets (Priority: P2)

**Goal**: Every successful `sh-run` writes durable audit/usage records and no MCP path logs or returns raw API keys.

**Independent Test**: Invoke `sh-run`, inspect audit/usage rows, and force success/failure logging with sentinel API key values.

- [x] T030 [P] [US5] Add failing audit and usage persistence tests for `sh-run` in `src/bcs/distribution/application/mcp-tools.test.ts`
- [x] T031 [P] [US5] Add failing raw-key log-safety tests for MCP request success and failure paths in `src/app/mcp/route.test.ts`
- [x] T032 [US5] Wrap `sh-run` expansion in `withAudit()` and call `recordPromptUsage()` in `src/bcs/distribution/application/mcp-tools.ts`
- [x] T033 [US5] Remove or avoid any raw-key-derived logging in `src/app/mcp/route.ts` and `src/bcs/distribution/application/mcp-session.ts`
- [x] T034 [US5] Verify User Story 5 focused tests in `src/bcs/distribution/application/mcp-tools.test.ts` and `src/app/mcp/route.test.ts`

---

## Final Phase: Polish & Cross-Cutting Concerns

**Purpose**: Complete compatibility and quality checks.

- [x] T035 [P] Update `specs/001-mcp-server-tools/quickstart.md` if implementation-specific smoke commands changed
- [x] T036 Run `corepack pnpm lint` and fix reported issues
- [x] T037 Run `corepack pnpm typecheck` and fix reported issues
- [x] T038 Run `corepack pnpm test` and fix reported issues
- [x] T039 Confirm all tasks are checked off in `specs/001-mcp-server-tools/tasks.md`

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies.
- **Foundational (Phase 2)**: Depends on Setup; blocks all user stories.
- **User Story 1 and 2 (P1)**: Depend on Foundational. US2 can start after tool registration exists from US1, but direct application tests can be written in parallel.
- **User Stories 3-5 (P2)**: Depend on Foundational and can proceed after core tool invocation plumbing exists.
- **Polish**: Depends on all selected stories.

### User Story Dependencies

- **US1**: Foundation only.
- **US2**: Foundation plus static tool metadata from US1.
- **US3**: Foundation plus static tool metadata from US1.
- **US4**: Foundation only.
- **US5**: US2 `sh-run` implementation.

### Parallel Opportunities

- T002-T003 can run in parallel.
- T005-T007 can run in parallel because they touch separate test files.
- T016-T018 can run in parallel because they cover separate behaviors.
- T027, T030, and T031 can be written in parallel after foundation.

## Parallel Example: User Story 2

```bash
Task: "Add sh-list/sh-search characterization tests in src/bcs/distribution/application/mcp-tool-characterization.test.ts"
Task: "Add sh-context tests in src/bcs/distribution/application/mcp-tools.test.ts"
Task: "Add sh-run tests in src/bcs/distribution/application/mcp-tools.test.ts"
```

## Implementation Strategy

1. Complete Setup and Foundational tasks to establish SDK route, session manager, and static tool contracts.
2. Deliver MVP with US1 tool discovery and bearer auth.
3. Implement P1 prompt/governance tools in US2.
4. Implement P2 workflow/session/audit/log-safety stories.
5. Run focused tests after each story, then full lint/typecheck/test gates.
