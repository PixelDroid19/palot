# Import architecture — Palot

Enterprise-style import rules for the Palot monorepo. Goal: **encapsulation**, not prettier paths.

## Current model (Option B — monorepo)

```
apps/
  desktop/     # Electron app (main + preload + renderer + shared)
  server/      # Hono API (browser dev only)

packages/
  ui/          # @palot/ui — design system
  configconv/  # @palot/configconv — config conversion library
  configconv-cli/
```

`apps/desktop` uses an **internal modular layout** (not separate npm packages yet):

| Module | Alias | Public entry |
|--------|-------|----------------|
| Renderer UI | `@/*`, `@/features/<name>`, `@/components/public` | Feature barrels + shell public API |
| Cross-runtime shared | `@desktop/shared` | `src/shared/index.ts` |
| Preload contract (types) | `@desktop/preload` | `src/preload/public-api.ts` |
| External UI | `@palot/ui/*` | `packages/ui` exports |
| Config conversion | `@palot/configconv` | `packages/configconv` root export |

## Rules

### 1. Within the same folder / feature

Short relatives are fine (max **2** parent segments):

```ts
import { sessionFamily } from "../atoms/sessions"
import { useAgents } from "../../hooks/use-agents"
```

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