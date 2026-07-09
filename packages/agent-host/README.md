# @gcode/agent-host

The core of GCode's multi-agent platform: run many AI coding CLIs (Claude
Code, Codex, and any future CLI) side by side, let them talk to each other,
and share context between them — without the core knowing anything about a
specific provider, Electron, or the UI.

## Architecture

```
┌─────────────────────────── embedder (desktop app, server, CLI) ───────────────────────────┐
│                                                                                            │
│   AgentHost ── the core                                                                    │
│   ├─ AdapterRegistry     which runtimes exist (plugin point)                               │
│   ├─ run()/cancel()      lifecycle: spawn → stream → reduce, per-session serialization,    │
│   │                      global concurrency cap, timeouts, process-group kill              │
│   ├─ EventBus            run:start / run:update / run:end                                  │
│   ├─ SharedContextStore  KV agents use to collaborate                                      │
│   └─ delegate()          run a one-shot task on another runtime                            │
│                                                                                            │
│   AgentBridge ── loopback HTTP + bearer token                                              │
│   └─ /v1/agents · /v1/delegate · /v1/context                                               │
│                                                                                            │
└────────────▲───────────────────────────────────────────────────────────────────────────────┘
             │ HTTP (token-authenticated)
   MCP proxy (stdio, dependency-free Node script, generated from MCP_PROXY_SOURCE)
             ▲ MCP over stdio
   CLI agent processes (claude / codex / …) — each gets a "gcode" MCP server with tools:
   gcode_list_agents · gcode_delegate · gcode_context_get/set/list
```

Design rules:

- **The core is provider-agnostic.** Everything CLI-specific is an
  `AgentAdapter`: two pure functions (`buildCommand`, `parseLine`) plus a
  binary name. Adapters hold no process state and are unit-testable against
  each CLI's real output.
- **The core is app-agnostic.** No Electron, no IPC, no UI imports. Embedders
  subscribe to the event bus and call `run`/`cancel`.
- **Extensibility without core changes.** New runtimes (including third-party
  or your own CLI) register via `host.adapters.register(adapter)`. The
  runtime id namespace is open (`string`), not a closed union.

## Usage

```ts
import { AgentHost, AgentBridge, MCP_PROXY_SOURCE } from "@gcode/agent-host"

const host = new AgentHost({ maxConcurrentRuns: 8 })

// Optional: enable inter-agent tools (delegation + shared context).
writeFileSync(proxyPath, MCP_PROXY_SOURCE)
const bridge = new AgentBridge(host, { proxyScriptPath: proxyPath, nodeBinary: "node" })
await bridge.start()

const result = await host.run("run-1", "claude", {
	prompt: "Summarize this repo",
	cwd: "/path/to/repo",
}, { sessionKey: "chat-42", onUpdate: (u) => console.log(u) })
```

### Adding a runtime

```ts
host.adapters.register({
	id: "my-cli",
	displayName: "My CLI",
	binary: "my-cli",
	buildCommand: (opts) => ({ args: ["run", "--json"], stdin: opts.prompt }),
	parseLine: (line) => [/* normalized AgentUpdates */],
})
```

## Capabilities & model discovery

`host.describeRuntimes()` returns, per runtime: install state, capabilities
(`imageInput`, `reasoningEffort`, `resume`), and the model catalog read from
the CLI's own source of truth — Codex's `~/.codex/models_cache.json` (with
per-model reasoning-effort levels), Claude's stable aliases. UIs should build
pickers from this instead of hardcoding models.

Image attachments: pass absolute file paths via `AgentRunOptions.images`.
Codex receives them with `-i`; Claude reads them with its Read tool (allowed
headlessly), referenced from the prompt.

## Reliability notes

- Prompts travel over **stdin**, never argv (length limits, quoting hazards).
- Runs have a hard **timeout** with SIGTERM → SIGKILL escalation, and kill the
  whole **process group** so CLI children can't linger.
- Turns on the same `sessionKey` are **serialized**; different sessions run in
  parallel up to `maxConcurrentRuns`.
- Claude Code runs in `stream-json` mode so long tasks stream instead of
  looking hung; the final `result` event stays authoritative.
- Codex only gets the bridge in `danger-full-access` runs: sandboxed
  `codex exec` auto-cancels MCP tool calls because the approval prompt can't
  be answered headlessly ([openai/codex#24135]). Delegated runs *to* Codex
  (e.g. Claude asking Codex for an image) don't need this — they go through
  the host, not Codex's own MCP client.

[openai/codex#24135]: https://github.com/openai/codex/issues/24135
