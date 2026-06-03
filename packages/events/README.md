# @palot/events

Typed event bus, PalotEvent union, explicit channels, batching/coalescing, and replay utilities for the Palot agent platform.

**Pure**: no React, Jotai, Lit, Electron, DOM, Node builtins, `window.palot`, or provider SDKs.

## Usage

```ts
import { EventBus, createEventBus, replayEventsIntoReducer } from "@palot/events"
import type { PalotEvent } from "@palot/events"

const bus = createEventBus()
bus.subscribe("session.lifecycle", (e) => { ... })
bus.publish("session.lifecycle", myEvent)
```

See `src/channels.ts`, `src/event-types.ts`, `src/replay.ts`, `src/event-bus.ts`.

## Role in Roadmap

Part of the foundational platform slice (core-agent-platform.md, lit-migration.md, functional-testing.md).

- Providers (adapters/harness) publish `PalotEvent`s.
- Core reducers consume them to produce state.
- UI (React during migration, Lit later) subscribes or derives view models.

## Testing

- Unit tests in `test/`.
- Event replay fixtures live in `fixtures/` (JSONL streams) and are exercised in `packages/core/test/`.

Run: `cd packages/events && bun test`

## Related

- `@palot/core` — consumes events via reducers + view models
- `@palot/agent-adapter-opencode`, `@palot/agent-harness`
- `@palot/ipc-contracts`
- `docs/IMPORT-ARCHITECTURE.md`
- `roadmap/`

Part of the 100% foundational platform (events + core + adapters + harness + lit + ipc).
