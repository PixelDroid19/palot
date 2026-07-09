# GCode Agent Instructions

## Purpose of This File

This file is injected into every agent session for this project. Keep it short.
Only add entries here if an agent is likely to get stuck or repeat a mistake without them.
Do NOT add one-time setup notes, general knowledge, or things discoverable from config files.

## Project Structure

- **Monorepo**: Turborepo + Bun workspaces (Bun 1.3.8)
- **`packages/ui`**: Shared shadcn/ui component library (`@gcode/ui`)
- **`packages/configconv`**: Universal agent config converter library (`@gcode/configconv`) -- converts between Claude Code, OpenCode, and Cursor formats
- **`packages/configconv-cli`**: Thin CLI wrapper (`configconv`) for the converter library
- **`packages/cli-registry`**: Detects installed coding-agent CLIs (`@gcode/cli-registry`) -- OpenCode, Claude Code, Codex, Cursor Agent, Gemini CLI; reports version and auth state via a host-injected, testable detection layer
- **`packages/agent-host`**: Multi-agent core (`@gcode/agent-host`) -- registry-only `AgentHost` (pluggable adapters, sessions, event bus, shared context) plus the **host tool plane** (`host.tools` / `HostToolRegistry`: automation, system, browser, agents, context) via `AgentBridge` (loopback HTTP + dynamic MCP proxy). Product tools are **host-owned** (desktop-host style), not CLI-owned; adapters only inject the bridge. Claude/Codex process adapters live here. Caveat: sandboxed `codex exec` auto-cancels MCP tool calls (openai/codex#24135) — Codex only gets the bridge in full-access runs.
- **`apps/desktop`**: Electron 40 + Vite desktop app (via `electron-vite`). **Product UI is Lit-only** (`src/renderer/lit/`). No React renderer shell.
- **`apps/server`**: Bun + Hono backend -- browser-mode dev only (`dev:web`), NOT bundled with Electron; also exports `@gcode/server` client/types
- **Runtime composition**: `apps/desktop/src/main/agents/composition.ts` + `AgentHost` options (`builtinProviders`, custom `providers`) plug/unplug harnesses. OpenCode is a **managed-server** adapter (descriptor registry), not the product base. Gateway services remain framework-free under `renderer/services/`.
- **OpenCode runtime boundary**: `apps/desktop/src/main/opencode-runtime.ts` owns CLI discovery, auth headers, readiness, server startup. Tray/automation/notifications must reuse it — do not rebuild bootstrap logic.
- **Host tool backends (desktop)**: `apps/desktop/src/main/agents/host-tool-backends.ts` wires real automation/system/browser into `host.tools` at `getAgentHost()` time.
- **Migration boundary**: `packages/configconv` is the single source of truth for Claude/Cursor/OpenCode migration. Skills migrate as linked directories (`linkedDirs`), not copied markdown stubs.

### Desktop App Layout (`apps/desktop/src/`)

- **`main/`** -- Electron main process (Node.js): window management, IPC, server lifecycle, filesystem
- **`main/agents/`** -- Host composition, AgentHost wiring, host tool backends, process-session lifecycle
- **`main/automation/`** -- Schedulers + neutral `executeAutomationRun` dispatch by registered runtime executors (fail closed if missing)
- **`preload/`** -- `window.gcode` via `contextBridge`
- **`renderer/lit/`** -- **Primary UI**: Lit custom elements, SCSS co-located (`foo.scss` → `foo.css.js` via `scripts/scss-to-cssjs.ts`), event bus + bubbling, locale controller
- **`renderer/services/`** -- Framework-free backend/session services (shared by Lit and any residual React)
- **`renderer/i18n/`** -- Dependency-free `translate(locale, key)` for **en** + **es** (Lit uses `LocaleController`; do not add React-only bindings for new UI)
- **`shared/`** -- Cross-process constants/types (runtime ids, transport registry)

## Skills

Project-specific skills live in `.agents/skills/`. Load a skill before starting
work that matches its domain -- they contain patterns and footguns that override
generic knowledge.

| Skill | When to load |
|---|---|
| `react-best-practices` | Not used for product UI (Lit-only). Optional for non-desktop packages if any. |

## Commands

- **Electron dev**: `cd apps/desktop && bun run dev` (runs `scss:build` then electron-vite; renderer on port 1420)
- **SCSS → css.js**: `cd apps/desktop && bun run scss:build` (or `scss:watch` for on-save compile)
- **Electron dev (root)**: `bun run dev:desktop`
- **Electron dev (Wayland)**: `bun run dev:desktop:wayland`
- **Browser-only dev**: `bun run dev:web` (Vite only, needs `apps/server` running)
- **Backend server** (browser mode only): `cd apps/server && bun run dev` (port 3100)
- **Lint check**: `bun run lint` (from root)
- **Lint/format fix**: `bun run lint:fix` or `bunx biome check --write .` (from root)
- **Run lint in package**: `cd <package-dir> && bun run lint`
- **Type check all**: `bun run check-types` (from root, via Turborepo)
- **Build all**: `bun run build` (from root, via Turborepo)
- **Type check desktop**: `cd apps/desktop && bun run check-types` (uses `tsgo`)
- **Run all tests**: `bun run test` (from root, via Turborepo -- runs every package's `test` task)
- **Run one package's tests**: `cd packages/agent-host && bun test` (or `packages/cli-registry`, `packages/configconv`)
- **Run single test file**: `cd packages/configconv && bun test test/converter/config.test.ts`
- **Run tests by name**: `cd packages/configconv && bun test --grep "converts model"` (applies to `agent-host` and `cli-registry` too)
- **Rebuild server types**: `cd apps/server && bun run build:types` (required after adding server routes)
- **Add UI component**: `cd packages/ui && bunx shadcn@latest add <component>`
- **Package**: `cd apps/desktop && bun run package` (or `package:linux`, `package:mac`, `package:win`, `package:all`)
- **Package without code signing (macOS)**: `CSC_IDENTITY_AUTO_DISCOVERY=false cd apps/desktop && bun run package:mac`
- **Changeset -- add**: `bun changeset` (interactive -- pick packages, bump type, write description)
- **Changeset -- version**: `bun run version-packages` (applies pending changesets, bumps versions, updates changelogs)

## Code Style

### Formatting (enforced by Biome 2.4.2)

- Tabs for indentation (width 2), line width 100, LF line endings
- Double quotes, semicolons as needed, trailing commas everywhere
- Arrow functions always use parentheses: `(x) => x`
- Run `bunx biome check --write .` from root to auto-fix

### Imports

- `node:` protocol for all Node.js builtins: `import path from "node:path"`
- Use `import type { ... }` for type-only imports (Biome warns otherwise)
- Order: external packages first, then internal/relative imports (no blank line between)
- Main process: `node:` builtins first, then `electron`, then local
- Renderer: `@gcode/ui` -> `@tanstack/*` -> `lucide-react` -> `react` -> local atoms/hooks/services

### Naming Conventions

- **Files**: `kebab-case.ts` / `kebab-case.tsx` everywhere
- **Functions/variables**: `camelCase` -- `createLogger()`, `fetchDiscovery()`
- **Components**: `PascalCase` -- `ChatView`, `AppSidebar`, `CommandPalette`
- **Types/interfaces**: `PascalCase` -- `DiscoveredProject`, `AgentStatus`
- **Props**: `ComponentNameProps` -- `ChatViewProps`, `AppSidebarProps`
- **Module-level constants**: `UPPER_SNAKE_CASE` -- `FRAME_BUDGET_MS`, `OPENCODE_PORT`
- **Jotai atoms**: `camelCaseAtom` -- `sessionIdsAtom`, `serverUrlAtom`
- **Atom families**: `camelCaseFamily` -- `sessionFamily`, `partsFamily`

### Types

- Prefer `interface` for object shapes, `type` for unions/aliases
- Export types only when used across modules
- Props: named interface for complex props, inline destructured type for small sub-components
- UI library uses `React.ComponentProps<"element">` intersection pattern for wrapper components

### React Patterns

- Functional components only, no class components
- State: **Jotai atoms** (NOT Zustand -- codebase has migrated). Store in `renderer/atoms/`
- Thin hook wrappers around atoms (e.g., `useAgents()` returns `useAtomValue(agentsAtom)`)
- Use `memo()` with named function expressions for perf-critical sub-components
- Custom hooks return objects, not arrays
- Named exports everywhere -- no default exports (except Hono route modules and Bun server entry)

### Error Handling

- No custom error classes -- use `new Error("descriptive message")`
- Services: try/catch, log with tagged logger, then rethrow
- Hooks: try/catch, set error state (`err instanceof Error ? err.message : "fallback"`)
- Main process IPC: wrap handlers with `withLogging()` for structured error logging
- Filesystem: check `(err as NodeJS.ErrnoException).code === "ENOENT"` for missing files
- Parallel IO: use `Promise.allSettled()` for resilient partial success
- SSE reconnect: exponential backoff loop capped at 30s

### Comments and File Organization

- Module-level `/** ... */` JSDoc at top of files for documentation
- `// ============================================================` section dividers for major sections
- `// ---` sub-section dividers within long functions
- File order: imports -> constants -> types -> state -> helpers -> public API/components -> sub-components

### Accessibility

- Always add `aria-hidden="true"` to decorative inline SVGs

### Current runtime realities

- Multi-conversation workspace (`cli-sessions`, chat gateway, handoff) is first-class; sessions persist and support mid-session runtime switch with explicit transcript handoff.
- Streaming tools, queued-message cancel, approval gates, model/effort/sandbox controls, and terminal-in-chat are normal paths.
- Onboarding owns typed migration previews/execution (Claude/Cursor/OpenCode), including skill-directory links.

## Critical Footguns

### Host tool plane -- do not brand-fork product tools

Automation, system, browser, agents, and context tools register on `AgentHost.tools` and are listed/called only via `AgentBridge` (`GET/POST /v1/tools*`) and the dynamic MCP proxy. Never reimplement `gcode_*` tools inside Claude/Codex/OpenCode adapters. Never gate tool availability with `runtimeId === "opencode"|"codex"|"claude"`. Missing tool/runtime → fail closed (explicit error), never silent brand fallback.

### Runtime dispatch -- registry and transport only

Chat create/prompt/switch goes through the neutral gateway + transport (`managed-server` vs process). Automation goes through `executeAutomationRun` + registered executors. Adding a harness = register adapter/executor + composition; do not add product `if (runtimeId === ...)` branches in UI/shell.

### Electron -- Two Runtime Contexts

The main process runs in Node.js, the renderer runs in a Chromium sandbox. They communicate via IPC only. Never import Node.js modules (`fs`, `child_process`, `path`) in the renderer -- use the `window.gcode` bridge or `services/backend.ts` instead.

### Backend Service Layer -- `services/backend.ts`

All hooks must import from `services/backend.ts`, NOT from `services/gcode-server.ts` directly. The backend module detects Electron (`"gcode" in window`) and routes to IPC or HTTP automatically.

### Lit product UI -- SCSS → css.js

- Co-locate `component.scss` next to `component.ts`. Run `bun run scss:build` (or `scss:watch`) to emit `component.css.js` exporting `styles` as Lit `css\`...\``.
- Import styles with `import { styles } from "./foo.css.js"` and set `static styles = styles`.
- **Never hand-edit `*.css.js`** — always regenerate from SCSS.
- Design tokens live in `renderer/lit/styles/_tokens.scss` (CSS variables, no Tailwind).

### Lit state -- events + bus (not Jotai)

- Prefer **bubbled `CustomEvent`** (`emitBubbled` in `lit/bus.ts`) for parent/child.
- Cross-tree topics use `gcodeBus` + `BusTopics` (locale, session select, nav, chat send).
- Each Lit element owns one concern; do not reintroduce a global React store for migrated trees.

### i18n en/es

- Core: `translate(locale, key, params?)` in `renderer/i18n/` (framework-free).
- Lit: `LocaleController` (`lit/locale-controller.ts`) — persists `gcode:locale`, publishes `BusTopics.localeChanged`.
- Add new strings to `locales/en.ts` first (types derive from `en`), mirror in `es.ts`.

### Lit-only desktop UI (no React)

- **Entry**: `renderer/main.tsx` → `lit/main-lit.ts` mounts `<gcode-app>` only. No `createRoot` / React App.
- **Components**: `renderer/lit/components/*` (one concern each). Styles: co-located `.scss` → `scripts/scss-to-cssjs.ts` → `.css.js`.
- **State**: bubbled `CustomEvent` + `gcodeBus` (`lit/bus.ts`). Locale: `LocaleController` + `gcode:locale` (en/es).
- **I/O**: `services/backend.ts`, `project-runtime-sdk.ts`, `lit/chat-runtime.ts` (agentSession), `lit/managed-chat.ts` (OpenCode).
- **Sessions**: `gcode:cliSessions` (string[]) + `gcode:cliSession:{id}` payloads via `lit/session-store.ts`.
- **Do not reintroduce React/Jotai/TanStack Router for product UI.**

### Tailwind (legacy packages/ui only)

`packages/ui` still uses Tailwind for any leftover shared React widgets. Lit surfaces must not depend on Tailwind utility classes.

### Biome -- CSS Disabled

Biome v2 cannot parse Tailwind v4 syntax. CSS linting/formatting is disabled. Do not try to enable it. SCSS is compiled outside Biome.

### Changesets -- versioning workflow

All five workspace packages are **linked** (version together). When making user-facing changes, run `bun changeset` before opening a PR.

### Packaging -- macOS without code signing

Always set `CSC_IDENTITY_AUTO_DISCOVERY=false` when building locally without an Apple Developer certificate.

### OpenCode SSE -- directory scoping

Use `/global/event` (not `/event`) to stream events from ALL projects. The SDK exposes this as `client.global.event()`.

### OpenCode SDK -- Always use v2 types

The `@opencode-ai/sdk` package ships both v1 and v2 type definitions. Always import from `@opencode-ai/sdk/v2/client` and check types under `dist/v2/gen/types.gen.d.ts` (NOT `dist/gen/types.gen.d.ts`). The v2 types are more complete (e.g., `session.create` accepts `permission?: PermissionRuleset`, `Permission` class has `respond`/`reply`/`list` methods). The v1 types are missing many fields and namespaces.

Always prefer re-using types from the SDK rather than defining local copies. The `@opencode-ai/sdk/v2/client` entry point re-exports all types from `gen/types.gen.js`, so types like `PermissionRuleset`, `PermissionRule`, `Session`, `Event`, etc. can be imported directly:

```ts
import type { PermissionRuleset, Session } from "@opencode-ai/sdk/v2/client"
```

### OpenCode model resolution

Always pass the resolved model to `promptAsync`. The server has no single "current model" concept.

### OpenCode local password attach

If a same-user OpenCode server is already listening on the configured local port and requires a password, GCode now refuses to attach with missing/stale local credentials. Save the local credential or stop the existing server; do not paper over this by silently connecting unauthenticated.

### Server type regeneration (browser mode only)

When adding routes to `apps/server`, run `cd apps/server && bun run build:types` to regenerate `.d.ts` files. Without this, new routes won't have type inference in the frontend RPC client.

### Electron -- Preload Timing

The `window.gcode` bridge is not available until the preload script finishes. Early-running renderer code (e.g., module-level calls, top-of-file side effects) must guard with optional chaining: `window.gcode?.someMethod()`.

### Electron -- External Links

Never open external URLs inside the Electron window. Use `setWindowOpenHandler` in the main process to deny and redirect to `shell.openExternal()`. This prevents navigation to untrusted content inside the app.

### GCode storage -- XDG Base Directory

GCode follows the XDG Base Directory Specification (same convention as OpenCode). Config at `~/.config/gcode/`, data at `~/.local/share/gcode/`. Automation configs live at `~/.config/gcode/automations/<id>/`, SQLite database at `~/.local/share/gcode/gcode.db`. See `main/automation/paths.ts` for the implementation. Do NOT use `~/.palot/` (legacy) or Electron's `userData` path for automation storage.

### electron-vite -- Three Build Targets

`electron.vite.config.ts` has three sections: `main`, `preload`, `renderer`. Main and preload use `externalizeDepsPlugin()` to keep Node.js deps external.

## Testing

- **Framework**: Bun's built-in test runner (`bun:test`) -- no vitest/jest/playwright
- **Tests exist in**: `apps/desktop`, `packages/agent-host`, `packages/cli-registry`, and `packages/configconv`
- CI runs `bun run test`
- For product-level validation, use the root stack: `bun run check-types`, `bun run test`, `bun run lint`, `bun run build`
- Run all: `bun run test` (from root)
- Run desktop tests: `cd apps/desktop && bun test test/`
- Run all in one package: `cd packages/configconv && bun test`
- Run one file: `cd packages/configconv && bun test test/converter/mcp.test.ts`
- Run by name: `cd packages/configconv && bun test --grep "pattern"`
