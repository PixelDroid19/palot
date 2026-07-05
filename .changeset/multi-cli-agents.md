---
"@palot/desktop": minor
---

Multi-CLI agent runtimes: Palot is no longer tied to OpenCode.

- **Runtime abstraction**: an `agents/` layer describes each coding-agent CLI as
  an adapter (how to build its headless command and parse its output into
  normalized updates) driven by a single generic runner. OpenCode is one
  session runtime among several rather than the hardwired backend.
- **CLI Agents workspace** (sidebar): multi-turn, persistent conversations with
  Codex and Claude Code. Each turn resumes the CLI's own session
  (`codex exec resume` / `claude --resume`) so context carries across turns,
  and conversations survive reloads (turns + session id are stored locally).
  Switch, start, and delete conversations from a list.
- **Runtime picker on New Session**: choose OpenCode or an installed CLI; picking
  a CLI hands the prompt off to the CLI Agents chat as the first turn, running
  in the selected project directory.
- **Detection**: installed CLIs (with version and auth state) are surfaced on the
  Setup page and in Settings → Integrations, powered by the new
  `@palot/cli-registry` package.
- New UI strings go through a lightweight typed i18n layer.
