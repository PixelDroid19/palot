---
"@palot/desktop": minor
---

Mid-session runtime switching with context handoff.

A conversation is no longer tied to one CLI: the chat toolbar now has a
runtime switch (OpenCode ↔ Codex ↔ Claude Code) available in every session.
Switching hands the conversation history to the new runtime, so context
survives — e.g. teach Codex something, switch to Claude Code, and it still
knows it.

- CLI ↔ CLI: same chat, the next prompt silently carries the transcript.
- OpenCode → CLI: the session converts in place (same transcript, same id).
- CLI → OpenCode: the transcript migrates to a fresh server session and the
  history rides along with the first prompt.
