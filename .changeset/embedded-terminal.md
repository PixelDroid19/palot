---
"@palot/desktop": minor
---

Embedded terminal, opened in the chat's directory.

Every session now has a real in-app terminal (a PTY via node-pty, rendered
with xterm.js) that opens already `cd`'d into the project the conversation is
about — no more copying an `opencode attach` command to paste in an external
terminal. Toggle it from the app-bar terminal button or with Cmd/Ctrl+J; it
docks under the chat, streams live I/O, resizes with the panel, and is killed
when closed or on quit. Works for OpenCode and CLI-backed (Codex, Claude Code)
sessions alike, since the cwd comes from the session's own directory.
