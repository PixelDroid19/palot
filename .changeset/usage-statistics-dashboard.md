---
"@palot/desktop": minor
---

Expand Palot's power-user feature set:

- **Usage statistics dashboard** (Settings → Usage): aggregates cost and token
  usage (input, output, reasoning, cache read/write) across every project and
  session, with a cache-hit rate, a 30-day cost chart, and per-model and
  per-project breakdowns. Data is fetched on demand via the OpenCode SDK with
  concurrency-limited message loading.
- **Plugin management** (Settings → Plugins): view, add, and remove OpenCode
  plugins (npm packages or local paths). Changes are persisted to the global
  OpenCode config via `config.update`.
- **Knowledge base generation**: a new-chat quick action that instructs the
  agent to explore the whole codebase and write/update `AGENTS.md` with
  architecture, key modules, conventions, and build/test commands.
- **Bot notifications** (Settings → Integrations): forward agent events
  (completion, permissions, questions, errors) to Feishu, WeChat Work, or a
  generic JSON webhook, with per-event toggles and a per-target test button.
- **SSH remote skill sync** (Settings → Integrations): push/pull user-level
  OpenCode skills to/from a remote host over SSH via rsync.
- **Remote & mobile access** (Settings → Integrations): surfaces the running
  OpenCode server's reachable endpoints so another device (a laptop's Palot,
  the web build, or a phone browser) can connect. Endpoints are typed and
  ranked (Tailscale → LAN → loopback); Tailscale CGNAT addresses are detected
  automatically to give a stable address that works from anywhere, and each
  endpoint renders a scannable QR code for one-tap phone pairing.
