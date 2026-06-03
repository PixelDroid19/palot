# @palot/agent-harness

Deterministic, in-memory implementation of `AgentProviderAdapter` + helpers for functional testing, E2E harness-mode, and replay.

Simulates the full surface without requiring a live OpenCode (or any external) process:

- projects / workspaces
- session lifecycle + streaming message parts
- tool calls + diffs
- permission requests / responses
- question requests / replies
- errors, reconnects, concurrent sessions
- automation runs
- abort, etc.

## Usage (tests)

```ts
import { createHarness } from "@palot/agent-harness"
import { rootReducer, deriveSidebarViewModel } from "@palot/core"

const harness = createHarness({ /* options */ })
harness.onEvent(e => { state = rootReducer(state, e) })
await harness.simulatePrompt("hello")
```

Also exposes `simulate*` methods and can drive the real event bus.

## Fixtures

Shared with core replay tests under `packages/events/fixtures/`.

## Role

Critical per roadmap: "Without it, a multi-provider UI migration will depend too much on live external tools."

Enables safe incremental migration (functional-testing.md).

## Related

- `@palot/core` (primary consumer)
- `@palot/agent-adapter-opencode` (for contract parity tests)
- Used in `apps/desktop/test/` and package tests.

See `roadmap/functional-testing.md`, `roadmap/core-agent-platform.md`.
