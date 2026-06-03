# Functional Testing Roadmap

## Goal

Protect real behavior while Palot migrates its core, event system, IPC
contracts, provider adapters, and UI components. The current tests are a useful
foundation. The migration needs more functional coverage around sessions,
streaming, permissions, questions, automation runs, native channels, and
provider behavior.

This roadmap has no time estimates. Every testing block should have clear
commands and acceptance criteria.

## Test Layers

### 1. Core Unit Tests

Recommended location:

```text
packages/core/test/
```

Cover:

- session reducers
- message and part reducers
- streaming delta handling
- event batching and coalescing
- permission and question rules
- effective model selection
- automation state transitions
- view model derivation
- command validation

These tests must not start Electron, React, Lit, or a real provider.

### 2. Provider Adapter Contract Tests

Recommended locations:

```text
packages/agent-adapter-opencode/test/
packages/agent-adapter-codex/test/
packages/agent-adapter-claude-code/test/
```

Cover:

- provider event to Palot event mapping
- Palot command to provider call mapping
- connection errors
- reconnect behavior
- streaming message parts
- tool calls
- permission requests
- question requests
- diffs
- session errors

OpenCode-specific contract coverage must verify:

- SDK v2 import path
- `/global/event` usage
- resolved model passed to `promptAsync`
- Electron fetch proxy behavior stays intact where applicable
- SSE requests are not serialized through IPC

### 3. Event Replay Tests

Recommended location:

```text
packages/events/test/replay/
```

Fixture examples:

```text
fixtures/
  opencode-session-basic.jsonl
  opencode-permission-question.jsonl
  opencode-streaming-tool-call.jsonl
  opencode-session-error.jsonl
  automation-run-actionable.jsonl
```

Each fixture should replay against the core and verify:

- final session state
- visible messages
- visible parts
- pending or resolved permissions
- pending or resolved questions
- automation state
- UI view model snapshots

This is one of the highest-value test additions because it lets the project
prove behavior without relying on a live external agent.

### 4. Lit Component Tests

Recommended location:

```text
packages/lit-components/test/
```

Cover each component:

- renders with minimal properties
- renders loading, empty, error, and long-content states when applicable
- emits the expected `CustomEvent`
- event includes typed `detail`
- event uses `bubbles: true` and `composed: true`
- generated `css.js` loads
- no forbidden runtime imports
- basic accessibility checks

Tooling options:

- Playwright component-style tests
- Web Test Runner
- Bun tests with a DOM implementation if the repo standardizes on one

### 5. Functional E2E With Palot Harness

Recommended locations:

```text
packages/agent-harness/
e2e/app-harness.spec.ts
```

The harness should simulate:

- projects
- sessions
- prompt async
- deterministic SSE
- permissions
- questions
- tool calls
- diffs
- errors
- reconnects
- idle completion

Required flows:

- create session and send prompt
- receive streaming content and finish idle
- respond to permission
- respond to question
- abort session
- load projects and sessions in the sidebar
- open a session by URL
- run an automation flow
- simulate SSE reconnect
- switch provider connection state

### 6. Electron And IPC Tests

When native channels change, test:

- main handler registration
- preload exposure
- TypeScript API contract
- renderer client wrapper
- input validation
- error propagation
- no Node imports in renderer
- external links stay in `shell.openExternal`

Use full Electron E2E only when the behavior depends on native runtime. For pure
contract behavior, prefer a smaller harness.

### 7. Visual And Layout Checks

For Lit and major UI migration steps:

- test light and dark mode
- test compact sidebars and long labels
- test desktop and narrow viewports
- test streaming chat content
- test permission and question panels with long content
- test automation rows with long titles

E2E tests should follow the existing policy: prefer `data-testid`, attributes,
roles, and URLs. Do not assert on user-visible copy unless the copy itself is the
feature being tested.

## Commands

Current commands:

```bash
bun run lint
bun run check-types
bun run test
bun run test:e2e
bun run verify
```

Recommended future commands:

```bash
bun run test:core
bun run test:events
bun run test:adapters
bun run test:lit
bun run test:harness
```

## Acceptance Policy

A core change is acceptable when:

- it has unit tests or event replay tests
- it does not depend on UI or provider SDKs
- it keeps behavior deterministic

A provider adapter change is acceptable when:

- it has contract tests
- it maps to canonical Palot events
- it handles errors and disconnects
- it does not leak provider-specific types into UI

A Lit component change is acceptable when:

- it has render and event tests
- its SCSS generates `css.js`
- it does not import forbidden runtimes
- it is usable outside the Electron app

An IPC change is acceptable when:

- main, preload, types, and client stay synchronized
- inputs are validated
- the exposed preload surface remains narrow
- behavior is covered by contract or functional tests

An end-to-end flow change is acceptable when:

- it has a mock-mode or harness-mode test
- it uses stable selectors
- it proves behavior, not copy

## Current Verification Snapshot

Latest reviewed state:

- `bun run lint` passed.
- `bun run test` passed.
- `bun run build:lit-styles` passed.
- `bun run build:styles` passed.
- `bun run check-types` failed in `@palot/desktop`.
- `cd apps/desktop && bun run build` failed in the Lit styles Vite plugin.

Before adding more roadmap implementation, add regression coverage for:

- desktop compiling Lit component imports with the correct decorator settings or
  consuming built declarations instead of source;
- `palotLitScss` resolving the generator path correctly regardless of cwd;
- server switch clearing or reconnecting the platform dispatch adapter;
- platform event feed batching/coalescing high-volume message events;
- the first harness-backed E2E session flow.
