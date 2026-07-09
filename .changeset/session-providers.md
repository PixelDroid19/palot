---
"@gcode/agent-host": minor
"@gcode/desktop": minor
---

CLI integrations rebuilt on persistent sessions (t3code/synara architecture).

- **Codex** now speaks `codex app-server` — the JSON-RPC-over-stdio protocol
  behind the official IDE extension. One shared process, threads per chat,
  `turn/start`/`turn/steer`/`turn/interrupt`, live `model/list` catalog, and
  approval requests (command execution, file changes) answered interactively.
- **Claude Code** now runs through the official Agent SDK with streaming
  input: a persistent query per session (context and caches survive across
  turns), `canUseTool` permission round-trip, `interrupt()` that keeps the
  session alive, `setModel()` mid-session, and the user's real configuration
  (CLAUDE.md, skills, MCP servers, permission rules) via `settingSources`.
- New `AgentSession`/`AgentSessionProvider` core replaces per-turn process
  spawning entirely.
- Desktop: `agent-session:*` IPC, an approval bar (allow / allow for session /
  deny) above the prompt input, message steering while a turn runs, and the
  inter-agent bridge available in every sandbox mode.
