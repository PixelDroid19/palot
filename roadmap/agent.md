# Agent Guide For The Palot Roadmap

This file guides agents implementing the roadmap in this directory. It is more
detailed than the root `AGENTS.md` because it focuses on the core extraction,
event architecture, provider adapters, Lit component migration, generated SCSS
styles, and functional testing strategy.

## Primary Rule

Do not perform a big-bang migration. Palot must keep working with OpenCode after
every step.

## Before Editing

1. Read the root `AGENTS.md`.
2. Read the relevant files in `roadmap/`.
3. Load local skills when the change touches their domain:
   - `react-best-practices` for renderer React work.
   - `electron-ipc` for main, preload, renderer bridge, or `window.palot`.
   - `opencode-sse` for SSE, `connection-manager`, OpenCode SDK v2, or global
     event behavior.
4. Run `git status --short` and do not revert unrelated changes.
5. Identify the affected layer:
   - UI
   - core
   - events
   - IPC
   - OpenCode adapter
   - provider adapters
   - Lit styles
   - functional tests

## Layer Rules

### `packages/core`

Allowed:

- plain TypeScript
- canonical types
- commands
- events
- reducers
- use cases
- view models
- abstract ports

Forbidden:

- React
- Jotai
- Lit
- Electron
- DOM
- Node builtins
- `window.palot`
- direct imports from `@opencode-ai/sdk`

### `packages/events`

Allowed:

- `EventBus`
- pub/sub channels
- replay utilities
- batching and coalescing
- serializable event types

Forbidden:

- UI state
- provider SDKs
- Electron
- DOM

### `packages/ipc-contracts`

Allowed:

- channel constants
- payload types
- response types
- schema validation
- helpers for main, preload, and renderer wiring

Rules:

- Keep channel definitions in one place.
- Validate inputs before native operations.
- Keep `window.palot` minimal.
- Do not expose raw filesystem, shell, or credential primitives without a
  product-level operation.

### `packages/agent-adapter-*`

Allowed:

- the SDK or protocol for the specific provider
- mapping provider events to Palot events
- mapping Palot commands to provider calls
- provider capability metadata

Rules:

- Do not leak raw provider types to UI packages.
- Use fixtures for event mapping tests.
- Keep OpenCode on SDK v2.
- Use `/global/event` for OpenCode.
- Pass resolved model values to OpenCode `promptAsync`.

### `packages/agent-harness`

Purpose:

- deterministic functional testing
- simulated provider behavior
- future Palot-native agent experimentation

Must support:

- projects
- sessions
- streaming
- tool calls
- permissions
- questions
- diffs
- errors
- reconnects
- idle completion

### `packages/lit-components`

Allowed:

- Lit
- Web Components
- typed properties
- typed `CustomEvent`
- generated `css.js` from local SCSS
- shared CSS custom properties

Forbidden:

- React
- Jotai
- Electron
- Node builtins
- `window.palot`
- direct provider SDK calls

Each component must:

- use a `palot-*` tag
- have a local `.scss` file
- import a generated `.css.js` file
- export itself from `index.ts`
- emit events with `bubbles: true` and `composed: true`
- have render and event tests

### `apps/desktop`

Responsibility:

- Electron host
- native lifecycle
- IPC implementation
- preload bridge
- app routing while React remains active
- compatibility adapters during migration

Rules:

- Renderer code must not import Node builtins.
- Existing hooks should continue using `services/backend.ts` until a new port
  replaces the behavior.
- IPC edits must keep main, preload, types, and renderer wrappers synchronized.
- External URLs must open through `shell.openExternal` in the main process.

## SCSS To `css.js`

Per component:

```text
palot-component.ts
palot-component.scss
palot-component.css.js
```

Rules:

- Edit SCSS only.
- Do not manually edit generated `css.js`.
- Regenerate styles on save during dev.
- Regenerate all styles before build.
- Fail fast on invalid SCSS.
- Keep output deterministic.
- Generate `.d.ts` when TypeScript needs it.

Generated format:

```js
import { css } from "lit"

export const styles = css`
  :host {
    display: block;
  }
`
```

## Lit DOM Event Rules

Recommended event names:

- `palot-session-selected`
- `palot-project-selected`
- `palot-prompt-submit`
- `palot-prompt-abort`
- `palot-permission-responded`
- `palot-question-replied`
- `palot-command-selected`
- `palot-settings-changed`
- `palot-automation-action`

Each event must:

- include typed `detail`
- use stable ids
- be serializable when possible
- use `bubbles: true`
- use `composed: true`
- be covered by tests

## Platform Pub/Sub Channels

Recommended channels:

- `app.lifecycle`
- `provider.connection`
- `workspace.discovery`
- `session.lifecycle`
- `session.messages`
- `session.permissions`
- `session.questions`
- `session.diff`
- `automation.runs`
- `settings.changed`
- `ui.navigation`

The UI publishes commands. Providers publish events. UI components do not call
provider SDKs.

## Safe Implementation Order

1. Define canonical Palot events and commands.
2. Add event bus and command bus.
3. Add OpenCode adapter against the new interface.
4. Add core reducers and view models.
5. Add deterministic Palot harness.
6. Add Lit package and SCSS-to-`css.js` pipeline.
7. Migrate leaf components.
8. Migrate composed components.
9. Migrate full surfaces.
10. Remove React/Jotai only when no active shell dependency remains.

## Required Tests By Change Type

Core:

- unit tests
- event replay tests when events are processed

Adapter:

- command contract tests
- event mapping tests
- provider fixture tests

Lit:

- render test
- property test
- event test
- style generation test

IPC:

- contract or functional test
- input validation coverage

UI flow:

- mock-mode E2E for presentation changes
- harness-mode E2E for behavior changes
- Electron/IPC E2E for native-channel behavior

## Useful Commands

```bash
bun run lint
bun run check-types
bun run test
bun run test:e2e
bun run verify
```

Desktop-only:

```bash
cd apps/desktop && bun run check-types
cd apps/desktop && bun test
```

Config converter:

```bash
cd packages/configconv && bun test
```

## Exit Criteria

Before finishing a task:

- The change is scoped to the correct layer.
- New business logic is not embedded in UI components.
- OpenCode compatibility is preserved.
- Lit packages do not depend on React.
- Core packages do not depend on provider SDKs.
- Generated `css.js` files are current if SCSS changed.
- Relevant tests were run, or skipped tests are reported with the reason.
- User-facing changes follow the root changeset policy.

