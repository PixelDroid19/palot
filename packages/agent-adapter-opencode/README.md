# @palot/agent-adapter-opencode

The reference implementation of `AgentProviderAdapter` for OpenCode.

- Uses `@opencode-ai/sdk/v2/client` (never v1).
- Uses `/global/event` (SDK `client.global.event()`).
- Translates OpenCode events → canonical `PalotEvent`.
- Implements command dispatch (with resolved `model` always passed to `promptAsync`).
- Preserves existing Electron proxy / SSE / reconnect behavior where applicable.

## Contract

Implements the port from `@palot/core/provider-adapter`.

```ts
import { createOpenCodeAdapter } from "@palot/agent-adapter-opencode"
const adapter = createOpenCodeAdapter(...)
await adapter.connect(...)
adapter.dispatch(command)
```

## Tests

- `adapter-contract.test.ts`
- `event-mapper.test.ts` (fixtures from `@palot/events/fixtures`)

## Rules (from roadmap/agent.md + core-agent-platform.md)

- Do not leak raw OpenCode types to UI / core.
- Always use resolved model.
- No "raro" fallbacks.

## Related

- `@palot/core`
- `@palot/events`
- `@palot/agent-harness` (for comparison in tests)
- OpenCode adapter is the only production adapter today; codex/claude are Phase 2 placeholders.

See `roadmap/`, `docs/IMPORT-ARCHITECTURE.md`.
