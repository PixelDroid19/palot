---
"@palot/desktop": minor
---

Multi-CLI awareness: Palot now detects the coding-agent CLIs installed on your
machine, not just OpenCode.

- New **`@palot/cli-registry`** package: a modular, host-injected registry that
  describes each coding-agent CLI (OpenCode, Claude Code, Codex, Cursor Agent,
  Gemini CLI) as a declarative adapter and probes the host for installation,
  version, and auth state. Covered by integration tests that run against the
  real filesystem and PATH.
- New **Coding CLIs** panel (Settings → Integrations): shows which agent CLIs
  are installed with their version, sign-in state, binary path, and docs link;
  missing CLIs show an install hint. OpenCode is flagged as the managed backend.
- CLIs with a supported config path (Claude Code, Cursor) get an inline
  **Migrate to OpenCode** action that reuses the existing migration engine
  (scan → convert → write with backup), so a detected CLI's settings, MCP
  servers, agents, commands, rules, and sessions can be imported in one click
  and undone from the Setup tab.
