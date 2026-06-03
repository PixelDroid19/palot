# Import architecture — Palot

Enterprise-style import rules for the Palot monorepo. Goal: **encapsulation**, not prettier paths.

## Current model (Option B — monorepo)

```
apps/
  desktop/     # Electron app (main + preload + renderer + shared)
  server/      # Hono API (browser dev only)

packages/
  ui/          # @palot/ui — design system (React)
  configconv/  # @palot/configconv — config conversion library
  configconv-cli/
  tokens/      # @palot/tokens — shared design tokens (css + ts)
  lit-styles/  # @palot/lit-styles — scss->css.js generator + vite plugin
  lit-components/ # @palot/lit-components — portable palot-* web components
  events/      # @palot/events — event bus, channels, PalotEvent, replay
  core/        # @palot/core — commands, reducers, view-models, use-cases, ports
  ipc-contracts/ # @palot/ipc-contracts — single source IPC channel+types+validation
  agent-adapter-opencode/ # @palot/agent-adapter-opencode — OpenCode impl of adapter
  agent-harness/ # @palot/agent-harness — deterministic test harness
```

`apps/desktop` uses an **internal modular layout** (not separate npm packages yet):

| Module | Alias | Public entry |
|--------|-------|----------------|
| Renderer UI | `@/*`, `@/features/<name>`, `@/components/public` | Feature barrels + shell public API |
| Cross-runtime shared | `@desktop/shared` | `src/shared/index.ts` |
| Preload contract (types) | `@desktop/preload` | `src/preload/public-api.ts` |
| External UI | `@palot/ui/*` | `packages/ui` exports |
| Config conversion | `@palot/configconv` | `packages/configconv` root export |
| Design tokens | `@palot/tokens` | `packages/tokens/src/index.ts` |
| Lit styles pipeline | `@palot/lit-styles` (and /vite-plugin) | `packages/lit-styles/src/index.ts` |
| Lit components | `@palot/lit-components` | `packages/lit-components/src/index.ts` |
| Platform events | `@palot/events` | `packages/events/src/index.ts` |
| Platform core | `@palot/core` (and /commands /sessions /view-models etc) | `packages/core/src/index.ts` |
| IPC contracts | `@palot/ipc-contracts` | `packages/ipc-contracts/src/index.ts` |
| OpenCode adapter | `@palot/agent-adapter-opencode` | `packages/agent-adapter-opencode/src/index.ts` |
| Test harness | `@palot/agent-harness` | `packages/agent-harness/src/index.ts` |

## Rules

### 1. Within the renderer (features, shell, hooks)

Prefer layer aliases over deep relatives:

```ts
import { sessionFamily } from "@/atoms/sessions"
import { useAgents } from "@/hooks/use-agents"
import { createLogger } from "@/lib/logger"
import { getProjectClient } from "@/services/connection-manager"
```

Inside a feature `ui/` folder, `./` and `../` for sibling modules are fine.

### 2. Across desktop runtimes (main ↔ renderer ↔ shared)

Use public entries only:

```ts
import { TEST_IDS } from "@desktop/shared"
import type { Automation } from "@desktop/preload"
```

**Forbidden** (enforced by ESLint):

```ts
import type { Automation } from "../../../preload/api"
import { TEST_IDS } from "../../../shared/test-ids"
```

### 3. Monorepo packages

```ts
import { Button } from "@palot/ui/components/button"
import { convertConfig } from "@palot/configconv"
```

Prefer the **package root** export. Subpaths like `@palot/configconv/converter/internal/...` are for in-package tests only.

### Platform packages (@palot/events, @palot/core, @palot/ipc-contracts, @palot/agent-*, @palot/lit-*, @palot/tokens)
Per roadmap/agent.md + core-agent-platform.md + lit-migration.md + AGENTS.md:
- `@palot/core`: pure TS only. Allowed: commands/events/reducers/use-cases/view-models/ports. Forbidden: React/Jotai/Lit/Electron/DOM/Node/window.palot/provider SDKs. Import from renderer ok; main only if aliased+excluded and appropriate (pure).
- `@palot/events`: pure bus + types + replay. No UI/provider/Electron.
- `@palot/ipc-contracts`: source of truth for channels/payloads/validation. Used to keep main/preload/renderer in sync.
- `@palot/agent-adapter-*`: map provider<->Palot only. Do not leak raw provider types to UI. Use fixtures, SDK v2, /global/event, resolved model to promptAsync.
- `@palot/agent-harness`: deterministic sim for tests/E2E (no live external). Supports projects/sessions/stream/perm/q/diff/error/reconnect.
- `@palot/lit-components`: Lit only, palot-* tags, local .scss + generated .css.js + .d.ts, typed CustomEvent (bubbles+composed). Forbidden: React/Jotai/Electron/Node/window.palot/provider SDKs. Receive props, emit DOM events only.
- `@palot/lit-styles` + `@palot/tokens`: build pipeline and shared CSS vars. Run `bun run build:styles` (from root) after .scss edits. Use vite plugin for dev watch.
- Import rules: renderer/services/hooks/atoms may use platform + lit (via demo adapters during migration). Never import platform adapter from main unless via shared+explicit. Use public barrels.

### 4. Renderer features (`features/*/ui`)

```
src/renderer/features/
  automations/index.ts   → AutomationsPage, AutomationDetail, …
  automations/ui/        → implementation (private to feature)
  settings/index.ts      → SettingsPage, ConnectProviderDialog, ProviderIcon, …
  onboarding/index.ts    → OnboardingOverlay
  chat/index.ts          → ChatView, MentionPopover, PromptToolbar, …
```

**Shell** (`components/sidebar`, `router`, `session-view`, …) imports domain UI only via `@/features/<name>`.

**Shell public API** ([`components/public.ts`](apps/desktop/src/renderer/components/public.ts)): features import shared shell pieces (`SessionView`, `APP_BAR_HEIGHT`, `useSetSidebarSlot`, review comment helpers, `PalotWordmark`) via `@/components/public` — never `../../../components/...`.

**Cross-feature** (allowed, via public API):

| Consumer | Import from |
|----------|-------------|
| `onboarding` | `@/features/settings` (`ConnectProviderDialog`, `ProviderIcon`) |
| `automations` | `@/features/chat` (model/agent selectors) |
| `chat` | `@/features/settings` (`ProviderIcon`) |

**ESLint** blocks `@/features/*/ui/*` outside that feature's `ui/` folder.

Optional future layers: `domain/`, `application/` under each feature — same rule: only `index.ts` is public.

### 5. `@/*` scope

`@/*` maps to `src/renderer/*` only. Do not use it from `src/main` or `src/shared`.

Feature barrels also have explicit paths: `@/features/automations`, `@/features/settings`, `@/features/onboarding`, `@/features/chat`.

## Adding a new renderer feature

1. Create `src/renderer/features/<name>/ui/` for components.
2. Add `src/renderer/features/<name>/index.ts` exporting the public surface.
3. Add `"@/features/<name>": ["./src/renderer/features/<name>/index.ts"]` in `tsconfig.json`.
4. Other code imports: `import { x } from "@/features/<name>"` — never `@/features/<name>/ui/...`.

## Shared vs feature

| Goes in `@desktop/shared` | Goes in feature |
|---------------------------|-----------------|
| Used by main **and** renderer | UI-only |
| Pure utils, constants, types | Business rules for one area |
| E2E test ids, scale limits | Components |

Avoid turning `shared` into a junk drawer — if only one feature uses it, keep it in the feature.

## Vite / electron-vite

Aliases are defined once in `apps/desktop/vite-aliases.ts` and wired in:

- `electron.vite.config.ts` (Electron dev + build)
- `src/renderer/vite.web.config.ts` (browser dev)

The renderer Vite `root` is `src/renderer/`, but `shared/` lives in `src/shared/`. Dev server **`server.fs.allow`** includes `src/` so `@desktop/shared` resolves in HMR (not only in production build).

## Tooling

| Tool | Command |
|------|---------|
| Full pre-PR gate | `bun run verify` |
| Format + Biome + import boundaries | `bun run lint` |
| Import boundaries only | `bun run lint:imports` |
| Types | `bun run check-types` |
| Tests | `bun run test` |

## Before / after

```ts
// Before
import { TEST_IDS } from "../../../shared/test-ids"
import type { Automation } from "../../../../preload/api"

// After
import { TEST_IDS } from "@desktop/shared"
import type { Automation } from "@desktop/preload"
```

## Platform packages (roadmap core extraction)

New packages under `packages/` implement the agent platform per `roadmap/`:

- `@palot/events` — EventBus, PalotEvent union, channels, replay utils. Pure. No UI/provider.
- `@palot/core` — PalotCommand, reducers (sessions+msgs+perm+q+automations+...), view models (derive*), use cases. Pure TS only (forbidden: React/Jotai/Lit/Electron/DOM/node/window.palot/@opencode).
- `@palot/agent-adapter-*` — Provider adapters (opencode first). Map native <-> PalotEvent/Command. Implement AgentProviderAdapter. Use SDK inside only.
- `@palot/agent-harness` — Deterministic local provider for tests (sim sessions, streaming, perms, q, diffs...).
- `@palot/ipc-contracts` — Single source CHANNELS + request/response types + validation. Derive main/preload/renderer.
- `@palot/tokens` — CSS custom props (--palot-*) + TS for React + Lit.
- `@palot/lit-styles` — SCSS -> lit css`...`.js + .d.ts generator + vite plugin. Central.
- `@palot/lit-components` — palot-* Web Components. Local .scss only, import generated .css.js, @customElement + @property, emit CustomEvent bubbles+composed. No React etc.

Import rules:
- Desktop renderer: can import @palot/* for integration (adapters, harness in tests, view models + bus for future migration, lit via side-effect import).
- Core/events/harness/ipc/lit must not import desktop, React, Electron, or provider SDKs (enforced by lint + review).
- See `roadmap/agent.md` for layer rules and `roadmap/lit-migration.md` for component contract.
- Update this doc + tsconfig/vite-aliases + package.json together when adding.

To depend (e.g. in desktop):
```json
"@palot/core": "workspace:*"
```
Paths + aliases in tsconfig + vite-aliases.ts.
```