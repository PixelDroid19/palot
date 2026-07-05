---
"@palot/agent-host": patch
"@palot/desktop": patch
---

Real streaming and richer events for CLI sessions.

- Claude Code now runs with `--include-partial-messages`: answer text and
  thinking stream token-by-token (new `reasoning-delta` update kind) instead of
  arriving as whole blocks. Subagent (Task) traffic is filtered out so nested
  output can't pollute the top-level answer.
- Tool calls render as live tool cards in CLI sessions: Claude `tool_use` /
  `tool_result` pairs and Codex `item.started`/`item.completed` are correlated
  by id, with command detail, status (running/completed/error) and truncated
  output.
- Codex: `turn.failed` surfaces as a notice; `file_change`, `mcp_tool_call` and
  `web_search` items render as tools; housekeeping events no longer emit
  "unknown" updates.
- Claude sandbox mapping fixed: `workspace-write` now maps to
  `--permission-mode acceptEdits` instead of full permission bypass;
  only `danger-full-access` uses `--dangerously-skip-permissions`.
- Notices (CLI warnings/errors) are used as the answer fallback when a run
  produces no message.
