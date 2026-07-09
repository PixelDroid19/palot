---
"@gcode/desktop": minor
---

Introduce `@gcode/agent-host`, the multi-agent core: a provider-agnostic
AgentHost (adapter registry, hardened run lifecycle with stdin prompts,
timeouts and process-group kill, per-session serialization, bounded
concurrency, event bus, shared context store) and an AgentBridge that exposes
`gcode_delegate` and `gcode_context_*` MCP tools to every running CLI so
agents can use each other's capabilities. Claude Code now streams via
stream-json (no more silent hangs on long tasks); Codex gains reasoning-effort
selection and bridge access in full-access runs. The desktop app's agent layer
is now a thin wiring over this core.
