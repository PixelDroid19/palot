# Current Implementation Review

Review date: 2026-06-02.

Scope reviewed:

- New platform packages under `packages/`.
- Desktop integration changes in Vite, TypeScript paths, renderer services, and
  `NewChat`.
- Roadmap files.
- Root scripts, Turbo config, Biome config, README, and import docs.

This review intentionally does not fix app code. It records what is working,
what is broken, and what should happen next so the roadmap can continue from the
real current state.

## Verification Results

Commands run:

```bash
bun run lint
bun run test
bun run check-types
cd apps/desktop && bun run build
bun run build:lit-styles
bun run build:styles
```

Results:

- `bun run lint`: passed.
- `bun run test`: passed.
- `bun run build:lit-styles`: passed and generated 9 Lit component style files.
- `bun run build:styles`: passed and generated 9 Lit component style files.
- `bun run check-types`: failed in `@palot/desktop`.
- `cd apps/desktop && bun run build`: failed in the renderer build.

Warnings:

- Turbo reports: `Workspace 'packages/agent-adapter-claude-code' not found in lockfile`.
- Turbo also reported equivalent lockfile warnings for other newly added
  packages in different commands.
- This usually means the workspace lockfile needs to be refreshed after the new
  packages were added.

## What Is Good

### Platform Packages Exist

The roadmap is no longer only conceptual. The repo now has concrete packages for:

- `@palot/events`
- `@palot/core`
- `@palot/agent-adapter-opencode`
- `@palot/agent-adapter-codex`
- `@palot/agent-adapter-claude-code`
- `@palot/agent-harness`
- `@palot/ipc-contracts`
- `@palot/tokens`
- `@palot/lit-styles`
- `@palot/lit-components`

This is the right direction for a platform split.

### Tests Cover The New Foundation

The new package tests are meaningful, especially:

- event bus and replay tests
- core reducer and view-model replay tests
- OpenCode adapter event-mapper and contract tests
- harness simulations for sessions, prompts, permissions, questions, diffs,
  reconnects, errors, and automation runs
- Lit component render and event tests

This is a strong start. The test suite is doing more than smoke testing.

### Lit Component Pipeline Exists

The SCSS-to-`css.js` generator works when run from the repository root or through
the root scripts. It generated 9 component style outputs successfully.

The component set also covers useful leaf components:

- session row
- project row
- status badge
- provider icon
- model option
- permission item
- question item
- attachment preview
- automation row

### Core And Events Are Mostly In The Right Layer

The new `@palot/events` and `@palot/core` packages are pure TypeScript and have
tests. That matches the roadmap direction.

The core now includes:

- command types
- event-driven reducers
- session/message/permission/question state
- automations state
- workspaces state
- settings state
- provider state
- view-model derivation
- replay-based tests

### OpenCode Adapter Is The Right First Adapter

`@palot/agent-adapter-opencode` is the right first provider adapter. It maps
OpenCode events to canonical Palot events and keeps SDK usage inside the adapter
package. That is the correct platform direction.

## What Is Broken

### Typecheck Fails In Desktop

`bun run check-types` fails in `@palot/desktop`.

Confirmed errors:

- `apps/desktop/src/renderer/services/backend.ts:39`: `FullCoreState` is
  imported but unused.
- `apps/desktop/src/renderer/services/backend.ts:89`:
  `dispatchPlatformCommand` is referenced but not in local scope. Re-exporting
  it does not create a local binding.
- Multiple `TS1240` and `TS1270` decorator errors occur for Lit component
  sources imported by the desktop compiler.

Root cause of the decorator errors:

- `apps/desktop/tsconfig.json` maps `@palot/lit-components` directly to
  `../../packages/lit-components/src/index.ts`.
- The desktop tsconfig does not enable the Lit decorator compiler options used
  by `packages/lit-components/tsconfig.json`.
- Because desktop compiles the package source directly, it applies desktop
  compiler options to Lit components.

Roadmap implication:

- The package integration is not stable until desktop typecheck passes.
- Either desktop must be configured for Lit decorators, or desktop should consume
  built package outputs/declarations instead of compiling source directly.

### Desktop Build Fails

`cd apps/desktop && bun run build` fails in the renderer build.

Confirmed error:

```text
Module not found "packages/lit-styles/src/build-scss-css-js.ts"
```

Root cause:

- `packages/lit-styles/src/vite-plugin-palot-lit-scss.ts` sets:
  `const generator = "bun packages/lit-styles/src/build-scss-css-js.ts"`.
- The plugin executes with `cwd: process.cwd()`.
- When running `cd apps/desktop && bun run build`, `process.cwd()` is
  `apps/desktop`, not the repo root.
- The relative generator path is therefore wrong.

Roadmap implication:

- The Lit styles pipeline works from root scripts, but the Vite plugin is not
  host-safe yet.
- The plugin must resolve the repo root or accept an explicit root/path option.

### Lockfile Is Not Fully Synced With New Workspaces

Turbo reports workspace lockfile warnings for new packages.

Roadmap implication:

- Run the package manager install/update step after adding the new workspaces.
- Verify that `bun.lock` includes all new workspace packages.
- Re-run `bun run check-types`, `bun run test`, and `bun run lint`.

### Demo Lit Components Are Visible In Real UI

`apps/desktop/src/renderer/components/new-chat.tsx` renders demo custom elements
under the `Build what's next` heading. The effect that exercises the harness is
dev-only, but the rendered custom element demo block is not dev-only.

Roadmap implication:

- Demo/proof UI should not be visible in normal app surfaces.
- Move this to a dedicated development route, story/demo surface, test harness,
  or behind an explicit dev flag.

### Platform Demo Code Is In A Product Screen

`NewChat` imports `@palot/events`, `@palot/core`, `@palot/agent-harness`, and
`@palot/agent-adapter-opencode` only to exercise wiring.

Roadmap implication:

- This proves package wiring, but it mixes platform demo code into a production
  screen.
- Move this proof into tests or a dedicated dev-only integration module.
- Product screens should receive view models and dispatch commands, not create
  harnesses or adapters directly.

### Dispatch Adapter Can Become Stale Across Server Switches

`connectToOpenCode` aborts the old connection when a connection already exists,
but `dispatchAdapter` is not cleared there. `ensurePlatformDispatchAdapter`
returns early whenever an adapter exists, without checking URL or auth.

Roadmap implication:

- If the server changes, the platform dispatch adapter can remain connected to
  the previous server.
- Track adapter URL/auth and reconnect when they change, or clear the adapter
  whenever a new OpenCode connection begins.

### Platform Event Feed Bypasses Batching

The legacy Jotai path still batches and coalesces events. The new platform
dual-write path maps every SSE payload and immediately updates:

- event bus
- core reducer state
- `platformCoreStateAtom`

Roadmap implication:

- High-volume streaming can cause too many core state writes.
- Reuse the same batching/coalescing strategy for the platform feed before
  making platform state a subscribed UI source.

### `getPalotAgentAdapter` Returns A Fake Adapter View

`getPalotAgentAdapter` returns a synthetic object whose methods mostly no-op or
return empty values. It delegates only `dispatch`.

Roadmap implication:

- This can mislead future callers into thinking they have a real adapter.
- Prefer exposing a narrow `dispatchViaPalotAgent` API until a real host adapter
  object can be returned.

### IPC Contracts Package Is Still A Placeholder

`@palot/ipc-contracts` exists, but currently only has an example `GET_VERSION`
contract and no real wiring to `main`, `preload`, or renderer wrappers.

Roadmap implication:

- Keep it marked as foundational only.
- Do not claim IPC contract migration is complete.
- The next useful step is migrating one real low-risk IPC channel through it.

## What Is Missing

### Missing Immediate Fixes

1. Fix desktop typecheck.
2. Fix the Lit Vite plugin path/cwd behavior.
3. Refresh the workspace lockfile.
4. Remove or isolate visible demo UI from `NewChat`.
5. Prevent stale OpenCode dispatch adapter reuse across server switches.

### Missing Architecture Work

1. A real Palot agent host layer that owns adapters, command dispatch, and event
   subscription outside product screens.
2. A proper platform event batching path.
3. Runtime validation for IPC contracts.
4. Import-boundary enforcement for new packages.
5. Migration of one real use case from legacy React/Jotai service code into
   `@palot/core`.

### Missing Lit Work

1. Host-safe Vite plugin configuration.
2. A dedicated component demo route or package-level preview.
3. A React adapter wrapper pattern for Web Components.
4. A first real replacement of a small existing React leaf component.
5. Proof that style generation works in `bun run dev`, `bun run dev:web`, and
   `cd apps/desktop && bun run build`.

### Missing Testing Work

1. E2E test using the deterministic harness.
2. Electron/IPC contract test for a real channel.
3. Regression test for server switch and dispatch adapter reset.
4. Regression test for Lit styles plugin cwd behavior.
5. Regression test for platform event batching/coalescing.

## Recommended Next Work Order

1. Fix the build and typecheck blockers.
2. Move demo wiring out of `NewChat`.
3. Refresh `bun.lock` for all new workspaces.
4. Add import-boundary checks for new packages.
5. Make `palotLitScss` resolve paths independently of current working
   directory.
6. Make platform dispatch adapter lifecycle track URL/auth.
7. Add a platform host module that owns command bus, adapter, and event feed.
8. Add harness-backed E2E for one session prompt flow.
9. Migrate one real leaf UI component to Lit behind a React adapter.
10. Migrate one low-risk IPC channel through `@palot/ipc-contracts`.

## Current Readiness

The platform foundation is promising but not production-ready.

Current status:

- Good enough for package-level experimentation and unit tests.
- Not good enough for a release or merge without fixes.
- Not ready for larger Lit screen migration.
- Not ready for Codex or Claude Code adapter implementation beyond current stubs.
