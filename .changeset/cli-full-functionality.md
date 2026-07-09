---
"@gcode/desktop": minor
---

CLI sessions are now fully functional: model catalogs come from each CLI's
own source of truth (no hardcoded lists) with per-model reasoning-effort
levels, model/effort/sandbox can be changed mid-session from the chat
toolbar, image attachments flow to both Codex (`-i`) and Claude Code (Read
tool), sessions persist across reloads and auto-title from the first
prompt, and the interface gains a Spanish locale plus a language setting.
Fixed the dev-mode startup crash (agent-host now bundles into the main
process).
