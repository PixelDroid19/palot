# Architecture Review

## Current Strengths

Palot already has a strong base:

- Bun and Turborepo monorepo with `apps/*` and `packages/*`.
- Electron separated into `main`, `preload`, `renderer`, and `shared`.
- `packages/ui` as a shared React/shadcn component package.
- `packages/configconv` as a portable library for Claude Code, OpenCode, and
  Cursor configuration conversion.
- Import boundaries documented in `docs/IMPORT-ARCHITECTURE.md`.
- Unit and E2E testing documented in `docs/TESTING.md`.
- OpenCode SDK v2 usage in the renderer and automation subsystem.
- Existing constraints around Electron IPC, preload timing, external links, and
  OpenCode SSE are already captured in project instructions.

The current design is solid for a React/Electron application. The next product
goal is larger: a multi-provider AI desktop platform with reusable Lit
components and a portable core. That requires extracting business logic and
provider behavior before doing a broad UI rewrite.

## Main Pressure Points

### 1. The Monorepo Exists, But The App Core Is Still Inside `apps/desktop`

Most product logic lives under:

- `apps/desktop/src/renderer`
- `apps/desktop/src/main`
- `apps/desktop/src/shared`

This works for the current Electron app, but it makes the core hard to reuse,
test, or extend for additional providers.

Recommended change:

- Create explicit packages for core, events, IPC contracts, and provider
  adapters.
- Move business rules and view-model construction out of React components.
- Treat `apps/desktop` as the host application, not as the owner of all domain
  logic.

### 2. `services/backend.ts` Is Useful, But Too Broad

`apps/desktop/src/renderer/services/backend.ts` currently centralizes runtime
detection and routes to Electron IPC or browser HTTP mode. It also exposes
OpenCode URL resolution, auth, git operations, settings, automations, and native
shell operations.

That facade is valuable, but the platform should not grow through one large
renderer service file.

Recommended change:

- Split the facade into typed ports:
  - `AgentProviderPort`
  - `WorkspacePort`
  - `SettingsPort`
  - `GitPort`
  - `AutomationPort`
  - `NativeShellPort`
- Keep `backend.ts` as a compatibility adapter while code migrates toward those
  ports.

### 3. IPC Contracts Are Manually Duplicated

Adding or changing IPC currently requires coordination across:

- `apps/desktop/src/main/ipc-handlers.ts`
- `apps/desktop/src/preload/index.ts`
- `apps/desktop/src/preload/api.d.ts`
- `apps/desktop/src/renderer/services/backend.ts`

This is manageable now, but will become fragile as Palot adds more native
capabilities, provider adapters, and a custom agent harness.

Recommended change:

- Create `packages/ipc-contracts`.
- Define channel names, payload types, response types, and validation in one
  place.
- Generate or derive main, preload, and renderer wrappers from that contract.
- Validate all inputs in the main process before touching filesystem, git,
  credentials, shell, updater, or notifications.

### 4. OpenCode SSE Is Optimized, But Coupled To Jotai

`connection-manager.ts` handles server health, OpenCode clients, SSE lifecycle,
16 ms batching, coalescing, and reconnection. `event-processor.ts` translates
SSE events into Jotai atom writes.

That is a good implementation for the current React app. It is not the right
long-term boundary for a Lit and multi-provider platform.

Recommended change:

- Split this into three layers:
  - provider transport and event mapping
  - canonical Palot event bus
  - UI stores and view models
- Convert OpenCode events into canonical Palot events before touching UI state.
- Keep batching and coalescing in a framework-neutral event runtime.

### 5. Large React Screens Mix Presentation, State, And Use Cases

Large files such as `chat-view.tsx`, `chat-tool-call.tsx`,
`connect-provider-dialog.tsx`, and `new-chat.tsx` contain presentation, local
state, model selection, session actions, permission handling, prompt handling,
and rendering details.

These files are understandable, but they are not a good foundation for a Lit
migration. Rewriting them directly into Lit would move the same coupling into a
new framework.

Recommended change:

- Extract framework-neutral use cases:
  - effective model selection
  - prompt and attachment preparation
  - permission and question response flows
  - create, fork, revert, unrevert, summarize, and abort session actions
  - chat input state transitions
  - session toolbar state
- Feed Lit and React through the same view models during migration.

### 6. `packages/ui` Is React-Specific

`packages/ui` is currently a React/shadcn/Tailwind package. It should remain
useful while React is still active, but Lit components need their own package.

Recommended change:

- Do not mix Lit components directly into `@palot/ui` at first.
- Add `packages/lit-components` for Web Components.
- Add shared tokens separately so React and Lit can use the same visual system.
- Export each stable Lit component individually.

### 7. Styling Is Global And Tailwind-Oriented

`packages/ui/src/styles/globals.css` owns Tailwind, shadcn, design tokens, and
glass effects. This is appropriate for the current React UI, but portable Lit
components need local styles.

Recommended change:

- Keep global tokens and app shell effects where they belong.
- Give each Lit component its own SCSS file.
- Generate a local `*.css.js` file for each component.
- Avoid Tailwind utility dependencies inside reusable Web Components.

### 8. Existing Tests Are Useful, But Not Enough For The Migration

The repo has unit tests, mock-mode E2E, and a live-mode smoke test. That is a
good baseline. The planned migration needs deeper behavior tests.

Recommended change:

- Add a deterministic agent harness for functional tests.
- Add event replay tests for provider streams.
- Add contract tests for provider adapters.
- Add component tests for Lit properties, events, and generated styles.
- Add targeted Electron/IPC tests when native channels change.

## Architectural Recommendation

Do not start by creating Lit screens. Start by creating framework-neutral
contracts and extracting state transitions.

The strongest architecture for this project is:

```text
Electron host
  native ports and IPC

Provider adapters
  OpenCode, Codex, Claude Code, Palot harness

Core platform
  commands, events, reducers, use cases, view models

UI packages
  React compatibility during migration
  Lit components as reusable final direction
```

This gives Palot a product architecture instead of a framework rewrite.

## Current Implementation Delta

The latest changes have started the recommended platform split:

- `@palot/events` exists with an event bus, command bus, channels, replay, and
  tests.
- `@palot/core` exists with reducers, view models, commands, use cases, and
  replay tests.
- `@palot/agent-adapter-opencode` exists with event mapping and contract tests.
- `@palot/agent-harness` exists with deterministic simulations and tests.
- `@palot/lit-styles` and `@palot/lit-components` exist with SCSS generation and
  component tests.
- `@palot/ipc-contracts` exists, but only as an example contract package.

This is a good direction, but the desktop host is not stable yet. The current
blockers are captured in `current-review.md` and should be resolved before
larger UI migration work.
