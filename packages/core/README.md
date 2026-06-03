# @palot/core

Canonical Palot commands, events (re-export), reducers (sessions, messages, permissions, questions, automations, ...), view models, use cases, and the `AgentProviderAdapter` port.

**Strictly pure TS**: forbidden imports — React, Jotai, Lit, Electron, DOM, Node builtins, `window.palot`, or any provider SDK (`@opencode-ai/sdk` etc.). Only depends on `@palot/events`.

## Key Exports

- `rootReducer`, `initialFullCoreState`
- `deriveSidebarViewModel`, `derive*` view models
- `PalotCommand` union + specific creators
- `AgentProviderAdapter` interface (for opencode, harness, future codex/claude)
- Use cases: prompt, permission respond, etc.
- Subpath exports: `@palot/core/commands`, `@palot/core/view-models`, etc.

## Usage (in tests / adapters / future hosts)

```ts
import { rootReducer, initialFullCoreState, deriveSidebarViewModel, createHarness } from "@palot/core"
import { replayEventsIntoReducer } from "@palot/events"

const harness = createHarness()
harness.emit({ type: "session.created", ... })
let state = rootReducer(initialFullCoreState, event)
const vm = deriveSidebarViewModel(state)
```

See `src/state.ts`, `src/reducers*` (in subdirs), `src/view-models/`, `src/use-cases/`, `src/provider-adapter.ts`.

## Role

Extracted business rules and state transitions from the React/Jotai app (see architecture-review.md, recommendations.md, core-agent-platform.md).

UI never talks to providers directly; it emits `PalotCommand`s and receives view models derived from core state.

## Testing

19+ tests + replay tests (basic, full, viewmodels, other reducers) using harness fixtures.

`cd packages/core && bun test`

## Related Packages

- `@palot/events`
- `@palot/agent-adapter-opencode`
- `@palot/agent-harness`
- `@palot/lit-components` (receive derived view models)
- `@palot/ipc-contracts`

See `roadmap/core-agent-platform.md`, `docs/IMPORT-ARCHITECTURE.md`, `AGENTS.md`.
